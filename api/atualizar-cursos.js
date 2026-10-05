const cheerio = require("cheerio");

const URL_SENAI =
  "https://al.senai.br/cursos/?modality%5B%5D=HABILITA%C3%87%C3%83O+T%C3%89CNICA+DE+N%C3%8DVEL+M%C3%89DIO&unit%5B%5D=PO%C3%87O&unit%5B%5D=DISTRITO+INDUSTRIAL";

const ID_CATALOGO = "senai_tecnicos";

function limparTexto(texto) {
  return String(texto || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function normalizarTexto(texto) {
  return limparTexto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarUrl(url) {
  let valor = String(url || "").trim();

  if (!valor) {
    return null;
  }

  const markdown = valor.match(/^\[[^\]]*\]\(([^)]+)\)$/);

  if (markdown) {
    valor = markdown[1].trim();
  }

  valor = valor
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .trim();

  if (valor.startsWith("//")) {
    return `https:${valor}`;
  }

  if (valor.startsWith("/")) {
    return `https://al.senai.br${valor}`;
  }

  if (
    valor.startsWith("http://") ||
    valor.startsWith("https://")
  ) {
    return valor;
  }

  return null;
}

function extrairInvestimento(texto) {
  const valor = limparTexto(texto);

  const padroes = [
    /\b\d+\s*[xX]\s*de\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}\b/i,
    /\b\d+\s*[xX]\s*de\s*R\$\s*\d+(?:,\d{2})?\b/i,
    /\bR\$\s*\d{1,3}(?:\.\d{3})*,\d{2}\b/i,
    /\bR\$\s*\d+(?:,\d{2})?\b/i,
  ];

  for (const padrao of padroes) {
    const match = valor.match(padrao);

    if (match) {
      return limparTexto(match[0]);
    }
  }

  return null;
}

function extrairInicio(texto) {
  const valor = limparTexto(texto);

  const match = valor.match(
    /In[ií]cio\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
  );

  return match ? match[1] : null;
}

function encontrarContainerCurso($, elementoTitulo) {
  let atual = $(elementoTitulo);

  for (let nivel = 0; nivel < 15; nivel++) {
    const texto = limparTexto(atual.text());

    const normalizado = normalizarTexto(texto);

    const tituloNormalizado = normalizarTexto(
      $(elementoTitulo).text()
    );

    const temTitulo =
      normalizado.includes(tituloNormalizado);

    const temInvestimento =
      /investimento\s*:/i.test(texto);

    const temConfira =
      /Confira/i.test(texto);

    const temInicio =
      /In[ií]cio\s*:/i.test(texto);

    if (
      nivel >= 1 &&
      temTitulo &&
      temInvestimento &&
      temInicio &&
      temConfira
    ) {
      return atual;
    }

    atual = atual.parent();

    if (!atual || atual.length === 0) {
      break;
    }
  }

  return $(elementoTitulo).parent();
}

function extrairDescricaoDoTexto(texto, titulo) {
  const valor = limparTexto(texto);

  if (!valor) {
    return null;
  }

  const tituloRegex = escaparRegex(titulo);

  const padrao = new RegExp(
    tituloRegex +
      "[\\s\\S]*?(?:Curso Técnico)?[\\s\\S]*?" +
      "(?:POÇO|DISTRITO INDUSTRIAL)?\\s*" +
      "([\\s\\S]*?)" +
      "In[ií]cio\\s*:",
    "i"
  );

  const match = valor.match(padrao);

  if (match && match[1]) {
    let descricao = limparTexto(match[1]);

    descricao = descricao
      .replace(/^Curso Técnico\s*/i, "")
      .replace(/^POÇO\s*/i, "")
      .replace(/^DISTRITO INDUSTRIAL\s*/i, "")
      .replace(/^POÇO\s+DISTRITO INDUSTRIAL\s*/i, "")
      .replace(/^DISTRITO INDUSTRIAL\s+POÇO\s*/i, "")
      .trim();

    if (descricao.length >= 15) {
      return descricao;
    }
  }

  return null;
}

function extrairDescricaoPorLinhas(texto, titulo) {
  const linhas = limparTexto(texto)
    .split("\n")
    .map((linha) => limparTexto(linha))
    .filter(Boolean);

  if (!linhas.length) {
    return null;
  }

  const tituloNormalizado =
    normalizarTexto(titulo);

  let indiceTitulo = linhas.findIndex(
    (linha) =>
      normalizarTexto(linha) ===
      tituloNormalizado
  );

  if (indiceTitulo === -1) {
    indiceTitulo = linhas.findIndex(
      (linha) =>
        normalizarTexto(linha).includes(
          tituloNormalizado
        )
    );
  }

  if (indiceTitulo === -1) {
    return null;
  }

  const candidatos = [];

  for (
    let indice = indiceTitulo + 1;
    indice < linhas.length;
    indice++
  ) {
    const linha = linhas[indice];
    const normalizada = normalizarTexto(linha);

    if (
      normalizada.startsWith("inicio:") ||
      normalizada.startsWith("inicio :")
    ) {
      break;
    }

    if (
      normalizada.startsWith("investimento:") ||
      normalizada.startsWith("investimento :")
    ) {
      break;
    }

    if (
      normalizada === "curso tecnico" ||
      normalizada === "curso técnico"
    ) {
      continue;
    }

    if (
      normalizada === "poco" ||
      normalizada === "distrito industrial" ||
      normalizada ===
        "poco distrito industrial" ||
      normalizada ===
        "distrito industrial poco"
    ) {
      continue;
    }

    if (/^confira$/i.test(linha)) {
      continue;
    }

    if (extrairInvestimento(linha)) {
      continue;
    }

    candidatos.push(linha);
  }

  if (!candidatos.length) {
    return null;
  }

  const descricao =
    limparTexto(candidatos.join(" "));

  return descricao.length >= 15
    ? descricao
    : null;
}

function transformarSrcSet(srcset) {
  if (!srcset) {
    return null;
  }

  const primeiro = String(srcset)
    .split(",")[0]
    .trim();

  if (!primeiro) {
    return null;
  }

  return primeiro
    .split(/\s+/)[0]
    .trim();
}

function extrairUrlDeEstilo(style) {
  const valor = String(style || "");

  const match = valor.match(
    /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i
  );

  return match ? match[1] : null;
}

function extrairImagem($, container) {
  let candidatos = [];

  function adicionar(valor) {
    const url = normalizarUrl(valor);

    if (!url) {
      return;
    }

    if (
      /\.svg(\?|$)/i.test(url) ||
      /placeholder/i.test(url) ||
      /loading/i.test(url)
    ) {
      return;
    }

    if (!candidatos.includes(url)) {
      candidatos.push(url);
    }
  }

  function analisarElemento(elemento) {
    const no = $(elemento);

    adicionar(no.attr("src"));
    adicionar(no.attr("data-src"));
    adicionar(no.attr("data-lazy-src"));
    adicionar(no.attr("data-original"));
    adicionar(no.attr("data-image"));
    adicionar(no.attr("data-bg"));
    adicionar(no.attr("data-background-image"));

    adicionar(
      transformarSrcSet(
        no.attr("srcset")
      )
    );

    adicionar(
      transformarSrcSet(
        no.attr("data-srcset")
      )
    );

    adicionar(
      extrairUrlDeEstilo(
        no.attr("style")
      )
    );
  }

  analisarElemento(container);

  container.find("*").each(function () {
    analisarElemento(this);
  });

  let atual = container.parent();

  for (let nivel = 0; nivel < 5; nivel++) {
    if (!atual || !atual.length) {
      break;
    }

    analisarElemento(atual);

    atual.find("img, source, a, div, figure, picture").each(
      function () {
        analisarElemento(this);
      }
    );

    atual = atual.parent();
  }

  return candidatos.length
    ? candidatos[0]
    : null;
}

function extrairUrl($, container) {
  const links = [];

  container.find("a[href]").each(
    function () {
      const href = $(this).attr("href");

      if (href) {
        links.push({
          href,
          texto: limparTexto($(this).text()),
        });
      }
    }
  );

  const confira = links.find(
    (item) =>
      /Confira/i.test(item.texto)
  );

  if (confira) {
    return normalizarUrl(confira.href);
  }

  const primeiroLink = links.find(
    (item) =>
      normalizarUrl(item.href)
  );

  return primeiroLink
    ? normalizarUrl(primeiroLink.href)
    : null;
}

function extrairUnidade(texto) {
  const valor = limparTexto(texto);

  const temPoco = /POÇO/i.test(valor);
  const temDistrito =
    /DISTRITO INDUSTRIAL/i.test(valor);

  if (temPoco && temDistrito) {
    return "POÇO DISTRITO INDUSTRIAL";
  }

  if (temPoco) {
    return "POÇO";
  }

  if (temDistrito) {
    return "DISTRITO INDUSTRIAL";
  }

  return null;
}

function obterBlocoDoCurso(
  textoPagina,
  titulo,
  titulos
) {
  const linhas = limparTexto(textoPagina)
    .split("\n")
    .map((linha) => limparTexto(linha))
    .filter(Boolean);

  const tituloNormalizado =
    normalizarTexto(titulo);

  let indiceAtual = linhas.findIndex(
    (linha) =>
      normalizarTexto(linha) ===
      tituloNormalizado
  );

  if (indiceAtual === -1) {
    indiceAtual = linhas.findIndex(
      (linha) =>
        normalizarTexto(linha).includes(
          tituloNormalizado
        )
    );
  }

  if (indiceAtual === -1) {
    return "";
  }

  const linhasBloco = [
    linhas[indiceAtual],
  ];

  const titulosNormalizados =
    titulos.map((item) =>
      normalizarTexto(item)
    );

  for (
    let indice = indiceAtual + 1;
    indice < linhas.length;
    indice++
  ) {
    const linhaNormalizada =
      normalizarTexto(linhas[indice]);

    if (
      titulosNormalizados.includes(
        linhaNormalizada
      ) &&
      linhaNormalizada !==
        tituloNormalizado
    ) {
      break;
    }

    linhasBloco.push(
      linhas[indice]
    );
  }

  return limparTexto(
    linhasBloco.join("\n")
  );
}

async function obterHtmlComScrapingBee(
  apiKey
) {
  const parametros =
    new URLSearchParams({
      api_key: apiKey,
      url: URL_SENAI,
      mode: "auto",
      max_cost: "25",
      country_code: "br",
      wait_for: "h3",
    });

  const url =
    `https://app.scrapingbee.com/api/v1/?${parametros.toString()}`;

  const resposta =
    await fetch(url);

  const html =
    await resposta.text();

  if (!resposta.ok) {
    throw new Error(
      `ScrapingBee retornou HTTP ${resposta.status}: ${html}`
    );
  }

  if (
    !html ||
    html.length < 1000
  ) {
    throw new Error(
      "ScrapingBee retornou HTML vazio ou incompleto."
    );
  }

  return html;
}

export default async function handler(
  req,
  res
) {
  try {
    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization ||
      "";

    const tokenRecebido =
      authHeader
        .replace(
          /^Bearer\s+/i,
          ""
        )
        .trim();

    const cronSecret =
      process.env.CRON_SECRET;

    if (!cronSecret) {
      return res.status(500).json({
        sucesso: false,
        erro:
          "CRON_SECRET não configurado.",
      });
    }

    if (
      !tokenRecebido ||
      tokenRecebido !== cronSecret
    ) {
      return res.status(401).json({
        sucesso: false,
        erro:
          "Não autorizado.",
      });
    }

    const scrapingBeeApiKey =
      process.env.SCRAPINGBEE_API_KEY;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!scrapingBeeApiKey) {
      return res.status(500).json({
        sucesso: false,
        erro:
          "SCRAPINGBEE_API_KEY não configurado.",
      });
    }

    if (!supabaseUrl) {
      return res.status(500).json({
        sucesso: false,
        erro:
          "SUPABASE_URL não configurado.",
      });
    }

    if (!supabaseSecretKey) {
      return res.status(500).json({
        sucesso: false,
        erro:
          "SUPABASE_SECRET_KEY não configurado.",
      });
    }

    const html =
      await obterHtmlComScrapingBee(
        scrapingBeeApiKey
      );

    const $ =
      cheerio.load(html);

    const titulos = [];

    $("h2, h3, h4, h5").each(
      function () {
        const titulo =
          limparTexto(
            $(this).text()
          );

        if (
          !/^TÉCNICO EM/i.test(
            titulo
          )
        ) {
          return;
        }

        if (
          !titulos.includes(titulo)
        ) {
          titulos.push(titulo);
        }
      }
    );

    if (!titulos.length) {
      throw new Error(
        "Nenhum curso técnico foi encontrado no HTML retornado pelo ScrapingBee."
      );
    }

    const textoPagina =
      limparTexto(
        $("body").text()
      );

    const cursos = [];

    $("h2, h3, h4, h5").each(
      function () {
        const elementoTitulo =
          this;

        const titulo =
          limparTexto(
            $(elementoTitulo).text()
          );

        if (
          !/^TÉCNICO EM/i.test(
            titulo
          )
        ) {
          return;
        }

        if (
          cursos.some(
            (curso) =>
              normalizarTexto(
                curso.titulo
              ) ===
              normalizarTexto(
                titulo
              )
          )
        ) {
          return;
        }

        const container =
          encontrarContainerCurso(
            $,
            elementoTitulo
          );

        const textoContainer =
          limparTexto(
            container.text()
          );

        const blocoCurso =
          obterBlocoDoCurso(
            textoPagina,
            titulo,
            titulos
          );

        let descricao =
          extrairDescricaoDoTexto(
            textoContainer,
            titulo
          );

        if (!descricao) {
          descricao =
            extrairDescricaoPorLinhas(
              textoContainer,
              titulo
            );
        }

        if (!descricao) {
          descricao =
            extrairDescricaoDoTexto(
              blocoCurso,
              titulo
            );
        }

        if (!descricao) {
          descricao =
            extrairDescricaoPorLinhas(
              blocoCurso,
              titulo
            );
        }

        let inicio =
          extrairInicio(
            textoContainer
          );

        if (!inicio) {
          inicio =
            extrairInicio(
              blocoCurso
            );
        }

        let investimento =
          extrairInvestimento(
            textoContainer
          );

        if (!investimento) {
          investimento =
            extrairInvestimento(
              blocoCurso
            );
        }

        const unidade =
          extrairUnidade(
            textoContainer
          ) ||
          extrairUnidade(
            blocoCurso
          );

        const imagem =
          extrairImagem(
            $,
            container
          );

        const url =
          extrairUrl(
            $,
            container
          );

        cursos.push({
          titulo,
          tipo: "Curso Técnico",
          unidade,
          descricao,
          inicio,
          investimento,
          imagem,
          url,
        });
      }
    );

    if (!cursos.length) {
      throw new Error(
        "Nenhum curso foi extraído."
      );
    }

    const catalogo = {
      id: ID_CATALOGO,

      filtros: {
        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL",
        ],

        url: URL_SENAI,
      },

      cursos,

      atualizado_em:
        new Date().toISOString(),
    };

    const respostaSupabase =
      await fetch(
        `${supabaseUrl}/rest/v1/catalogos_cursos?on_conflict=id`,
        {
          method: "POST",

          headers: {
            apikey:
              supabaseSecretKey,

            Authorization:
              `Bearer ${supabaseSecretKey}`,

            "Content-Type":
              "application/json",

            Prefer:
              "resolution=merge-duplicates,return=representation",
          },

          body:
            JSON.stringify(
              catalogo
            ),
        }
      );

    const respostaSupabaseTexto =
      await respostaSupabase.text();

    if (
      !respostaSupabase.ok
    ) {
      throw new Error(
        `Supabase retornou HTTP ${respostaSupabase.status}: ${respostaSupabaseTexto}`
      );
    }

    return res.status(200).json({
      sucesso: true,
      mensagem:
        "Catálogo atualizado com sucesso",
      total: cursos.length,
      atualizado_em:
        catalogo.atualizado_em,
      cursos,
    });
  } catch (erro) {
    console.error(
      "Erro ao atualizar catálogo:",
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro:
        erro.message ||
        "Erro interno ao atualizar catálogo.",
    });
  }
}
