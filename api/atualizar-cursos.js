const cheerio = require("cheerio");

const URL_SENAI =
  "https://al.senai.br/cursos/?modality%5B%5D=HABILITA%C3%87%C3%83O+T%C3%89CNICA+DE+N%C3%8DVEL+M%C3%89DIO&unit%5B%5D=PO%C3%87O&unit%5B%5D=DISTRITO+INDUSTRIAL";

const ID_CATALOGO = "senai_tecnicos";

function limparTexto(texto) {
  return String(texto || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/[ \t]+/g, " ")
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

function extrairInvestimento(texto) {
  const valor = limparTexto(texto);

  const padraoParcelamento =
    /\b\d+\s*[xX]\s*de\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}\b/i;

  const padraoValor =
    /\bR\$\s*\d{1,3}(?:\.\d{3})*,\d{2}\b/i;

  const parcelamento = valor.match(padraoParcelamento);

  if (parcelamento) {
    return parcelamento[0];
  }

  const apenasValor = valor.match(padraoValor);

  if (apenasValor) {
    return apenasValor[0];
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

function extrairDescricao(texto, titulo) {
  const valor = limparTexto(texto);

  if (!valor) {
    return null;
  }

  const tituloNormalizado = normalizarTexto(titulo);

  const linhas = valor
    .split("\n")
    .map((linha) => limparTexto(linha))
    .filter(Boolean);

  const linhasSemDuplicadas = [];

  for (const linha of linhas) {
    if (
      linhasSemDuplicadas.length === 0 ||
      normalizarTexto(linha) !==
        normalizarTexto(
          linhasSemDuplicadas[linhasSemDuplicadas.length - 1]
        )
    ) {
      linhasSemDuplicadas.push(linha);
    }
  }

  let indiceTitulo = linhasSemDuplicadas.findIndex(
    (linha) => normalizarTexto(linha) === tituloNormalizado
  );

  if (indiceTitulo === -1) {
    indiceTitulo = linhasSemDuplicadas.findIndex((linha) =>
      normalizarTexto(linha).includes(tituloNormalizado)
    );
  }

  if (indiceTitulo === -1) {
    return null;
  }

  const depoisTitulo = linhasSemDuplicadas.slice(indiceTitulo + 1);

  const ignorar = [
    "curso técnico",
    "curso tecnico",
    "investimento:",
    "confira",
  ];

  const candidatos = [];

  for (const linha of depoisTitulo) {
    const normalizada = normalizarTexto(linha);

    if (!normalizada) {
      continue;
    }

    if (
      normalizada === "inicio:" ||
      normalizada.startsWith("inicio:")
    ) {
      break;
    }

    if (
      normalizada === "investimento:" ||
      normalizada.startsWith("investimento:")
    ) {
      break;
    }

    if (
      ignorar.includes(normalizada) ||
      normalizada.startsWith("unidade:")
    ) {
      continue;
    }

    if (/^\d+\s*[xX]\s*de\s*R\$/i.test(linha)) {
      continue;
    }

    if (/^R\$\s*\d/i.test(linha)) {
      continue;
    }

    if (normalizada === "poço" || normalizada === "distrito industrial") {
      continue;
    }

    if (
      normalizada === "poço distrito industrial" ||
      normalizada === "distrito industrial poço"
    ) {
      continue;
    }

    candidatos.push(linha);
  }

  if (candidatos.length > 0) {
    const descricao = limparTexto(candidatos.join(" "));

    if (descricao.length >= 15) {
      return descricao;
    }
  }

  return null;
}

function encontrarContainerCurso($, elementoTitulo) {
  let atual = $(elementoTitulo);

  for (let nivel = 0; nivel < 12; nivel++) {
    const texto = limparTexto(atual.text());

    const temTitulo = normalizarTexto(texto).includes(
      normalizarTexto($(elementoTitulo).text())
    );

    const temInicio = /In[ií]cio\s*:/i.test(texto);

    const temInvestimento = /Investimento\s*:/i.test(texto);

    const temConfira = /Confira/i.test(texto);

    if (
      nivel >= 1 &&
      temTitulo &&
      (temInicio || temInvestimento || temConfira)
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

function extrairUnidade(texto) {
  const valor = limparTexto(texto);

  const unidadesEncontradas = [];

  if (/POÇO/i.test(valor)) {
    unidadesEncontradas.push("POÇO");
  }

  if (/DISTRITO INDUSTRIAL/i.test(valor)) {
    unidadesEncontradas.push("DISTRITO INDUSTRIAL");
  }

  return unidadesEncontradas.join(" ") || null;
}

function extrairImagem($, container) {
  let src = null;

  const imagem = container.find("img").first();

  if (imagem.length) {
    src =
      imagem.attr("src") ||
      imagem.attr("data-src") ||
      imagem.attr("data-lazy-src") ||
      null;
  }

  if (!src) {
    const imagemPrincipal = container
      .closest("article")
      .find("img")
      .first();

    if (imagemPrincipal.length) {
      src =
        imagemPrincipal.attr("src") ||
        imagemPrincipal.attr("data-src") ||
        imagemPrincipal.attr("data-lazy-src") ||
        null;
    }
  }

  if (!src) {
    return null;
  }

  if (src.startsWith("//")) {
    return `https:${src}`;
  }

  if (src.startsWith("/")) {
    return `https://al.senai.br${src}`;
  }

  return src;
}

function extrairUrl($, container) {
  const link = container.find("a").filter(function () {
    return /Confira/i.test(limparTexto($(this).text()));
  }).first();

  if (link.length) {
    const href = link.attr("href");

    if (href) {
      if (href.startsWith("/")) {
        return `https://al.senai.br${href}`;
      }

      return href;
    }
  }

  const qualquerLink = container.find("a[href]").first();

  if (qualquerLink.length) {
    const href = qualquerLink.attr("href");

    if (href) {
      if (href.startsWith("/")) {
        return `https://al.senai.br${href}`;
      }

      return href;
    }
  }

  return null;
}

function coletarTextoSequencial($, elementoTitulo) {
  const bodyText = limparTexto($("body").text());

  return bodyText;
}

function extrairBlocoPorTitulo(textoPagina, titulo, titulos) {
  const textoNormalizado = normalizarTexto(textoPagina);

  const tituloNormalizado = normalizarTexto(titulo);

  const inicio = textoNormalizado.indexOf(tituloNormalizado);

  if (inicio === -1) {
    return null;
  }

  let fim = textoPagina.length;

  const indiceAtual = titulos.findIndex(
    (item) => normalizarTexto(item) === tituloNormalizado
  );

  if (indiceAtual !== -1) {
    for (let i = indiceAtual + 1; i < titulos.length; i++) {
      const proximoTitulo = normalizarTexto(titulos[i]);
      const posicaoProximo = textoNormalizado.indexOf(
        proximoTitulo,
        inicio + titulo.length
      );

      if (posicaoProximo !== -1) {
        fim = posicaoProximo;
        break;
      }
    }
  }

  return limparTexto(textoPagina.slice(inicio, fim));
}

async function obterHtmlComScrapingBee(apiKey) {
  const parametros = new URLSearchParams({
    api_key: apiKey,
    url: URL_SENAI,
    render_js: "true",
    country_code: "br",
    wait_for: "h3",
    mode: "auto",
    max_cost: "25",
  });

  const url = `https://app.scrapingbee.com/api/v1/?${parametros.toString()}`;

  const resposta = await fetch(url);

  const html = await resposta.text();

  if (!resposta.ok) {
    throw new Error(
      `ScrapingBee retornou HTTP ${resposta.status}: ${html}`
    );
  }

  if (!html || html.length < 1000) {
    throw new Error("ScrapingBee retornou HTML vazio ou incompleto.");
  }

  return html;
}

export default async function handler(req, res) {
  try {
    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization ||
      "";

    const tokenRecebido = authHeader.replace(/^Bearer\s+/i, "").trim();

    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return res.status(500).json({
        sucesso: false,
        erro: "CRON_SECRET não configurado.",
      });
    }

    if (!tokenRecebido || tokenRecebido !== cronSecret) {
      return res.status(401).json({
        sucesso: false,
        erro: "Não autorizado.",
      });
    }

    const scrapingBeeApiKey = process.env.SCRAPINGBEE_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!scrapingBeeApiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "SCRAPINGBEE_API_KEY não configurado.",
      });
    }

    if (!supabaseUrl) {
      return res.status(500).json({
        sucesso: false,
        erro: "SUPABASE_URL não configurado.",
      });
    }

    if (!supabaseSecretKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "SUPABASE_SECRET_KEY não configurado.",
      });
    }

    const html = await obterHtmlComScrapingBee(scrapingBeeApiKey);

    const $ = cheerio.load(html);

    const titulos = [];

    $("h2, h3, h4, h5").each(function () {
      const texto = limparTexto($(this).text());

      if (!/^TÉCNICO EM/i.test(texto)) {
        return;
      }

      if (!titulos.includes(texto)) {
        titulos.push(texto);
      }
    });

    if (titulos.length === 0) {
      throw new Error(
        "Nenhum curso técnico foi encontrado no HTML retornado pelo ScrapingBee."
      );
    }

    const textoPagina = coletarTextoSequencial($);

    const cursos = [];

    $("h2, h3, h4, h5").each(function () {
      const elementoTitulo = this;

      const titulo = limparTexto($(elementoTitulo).text());

      if (!/^TÉCNICO EM/i.test(titulo)) {
        return;
      }

      if (
        cursos.some(
          (curso) => normalizarTexto(curso.titulo) === normalizarTexto(titulo)
        )
      ) {
        return;
      }

      const container = encontrarContainerCurso($, elementoTitulo);

      const textoContainer = limparTexto(container.text());

      const blocoSequencial =
        extrairBlocoPorTitulo(textoPagina, titulo, titulos) || "";

      const textoBusca = limparTexto(
        `${textoContainer}\n${blocoSequencial}`
      );

      let descricao = extrairDescricao(textoContainer, titulo);

      if (!descricao) {
        descricao = extrairDescricao(blocoSequencial, titulo);
      }

      let inicio = extrairInicio(textoContainer);

      if (!inicio) {
        inicio = extrairInicio(blocoSequencial);
      }

      let investimento = extrairInvestimento(textoContainer);

      if (!investimento) {
        investimento = extrairInvestimento(blocoSequencial);
      }

      if (!investimento) {
        const posicaoInvestimento = textoBusca.search(
          /Investimento\s*:/i
        );

        if (posicaoInvestimento !== -1) {
          const trechoInvestimento = textoBusca.slice(
            posicaoInvestimento,
            posicaoInvestimento + 200
          );

          investimento = extrairInvestimento(trechoInvestimento);
        }
      }

      const unidade = extrairUnidade(textoContainer) ||
        extrairUnidade(blocoSequencial);

      const imagem =
        extrairImagem($, container) ||
        null;

      const url =
        extrairUrl($, container) ||
        null;

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
    });

    if (cursos.length === 0) {
      throw new Error("Nenhum curso foi extraído.");
    }

    const catalogo = {
      id: ID_CATALOGO,
      filtros: {
        modalidade: "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",
        unidades: ["POÇO", "DISTRITO INDUSTRIAL"],
        url: URL_SENAI,
      },
      cursos,
      atualizado_em: new Date().toISOString(),
    };

    const respostaSupabase = await fetch(
      `${supabaseUrl}/rest/v1/catalogos_cursos?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(catalogo),
      }
    );

    const respostaSupabaseTexto = await respostaSupabase.text();

    if (!respostaSupabase.ok) {
      throw new Error(
        `Supabase retornou HTTP ${respostaSupabase.status}: ${respostaSupabaseTexto}`
      );
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Catálogo atualizado com sucesso",
      total: cursos.length,
      atualizado_em: catalogo.atualizado_em,
      cursos,
    });
  } catch (erro) {
    console.error("Erro ao atualizar catálogo:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: erro.message || "Erro interno ao atualizar catálogo.",
    });
  }
}
