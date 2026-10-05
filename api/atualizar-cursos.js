const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400"
);
const authorization =
  req.headers.authorization || "";

if (
  !process.env.CRON_SECRET ||
  authorization !==
    `Bearer ${process.env.CRON_SECRET}`
) {

  return res.status(401).json({
    sucesso: false,
    erro: "Não autorizado"
  });

}
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido"
    });
  }

  try {

    const token = process.env.BROWSERLESS_TOKEN;

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "BROWSERLESS_TOKEN não configurado no Vercel"
      });
    }
const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

if (
  !supabaseUrl ||
  !supabaseSecretKey
) {

  return res.status(500).json({
    sucesso: false,
    erro:
      "Variáveis do Supabase não configuradas"
  });

}

const supabase =
  createClient(
    supabaseUrl,
    supabaseSecretKey
  );
    
    const params = new URLSearchParams();

    params.append(
      "modality[]",
      "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO"
    );

    params.append(
      "unit[]",
      "POÇO"
    );

    params.append(
      "unit[]",
      "DISTRITO INDUSTRIAL"
    );

    const url =
      "https://al.senai.br/cursos/?" +
      params.toString();

    const browserlessUrl =
      "https://production-sfo.browserless.io/unblock" +
      "?token=" +
      encodeURIComponent(token) +
      "&proxy=residential" +
      "&proxyCountry=br";

    const resposta = await fetch(browserlessUrl, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        url: url,
        content: true,
        cookies: false,
        screenshot: false,
        browserWSEndpoint: false,
        waitForTimeout: 5000
      })

    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(500).json({
        sucesso: false,
        erro: "Browserless retornou erro",
        status: resposta.status,
        detalhe: dados
      });
    }

    const html = dados.content || "";

    if (!html) {
      return res.status(500).json({
        sucesso: false,
        erro: "HTML não encontrado na resposta do Browserless"
      });
    }

    const $ = cheerio.load(html);

    const cursos = [];
    const cursosProcessados = new Set();

    function limparTexto(valor) {

      return String(valor || "")
        .replace(/\s+/g, " ")
        .trim();

    }

    function normalizarSlug(titulo) {

      return titulo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, "-");

    }

    function encontrarContainerDados(elemento) {

      let atual = $(elemento);

      for (let nivel = 0; nivel < 12; nivel++) {

        atual = atual.parent();

        if (!atual || !atual.length) {
          break;
        }

        const texto =
          limparTexto(atual.text());

        const temInicio =
          /Início\s*:/i.test(texto);

        const temInvestimento =
          /Investimento\s*:/i.test(texto);

        if (
          temInicio &&
          temInvestimento &&
          texto.length > 80 &&
          texto.length < 2500
        ) {

          return atual;

        }

      }

      return $(elemento);

    }

    function encontrarContainerVisual(elemento) {

      let atual = $(elemento);

      for (let nivel = 0; nivel < 12; nivel++) {

        atual = atual.parent();

        if (!atual || !atual.length) {
          break;
        }

        const texto =
          limparTexto(atual.text());

        const temCursoTecnico =
          /Curso Técnico/i.test(texto);

        const temUnidade =
          /POÇO|DISTRITO INDUSTRIAL/i.test(texto);

        const possuiImagem =
          atual.find("img").length > 0;

        if (
          temCursoTecnico &&
          temUnidade &&
          possuiImagem
        ) {

          return atual;

        }

      }

      return null;

    }

    function encontrarUnidade(container) {

      if (!container || !container.length) {
        return null;
      }

      const texto =
        limparTexto(
          container.text()
        ).toUpperCase();

      const unidades = [];

      if (
        texto.includes("POÇO")
      ) {
        unidades.push("POÇO");
      }

      if (
        texto.includes("DISTRITO INDUSTRIAL")
      ) {
        unidades.push("DISTRITO INDUSTRIAL");
      }

      return unidades.length
        ? unidades.join(", ")
        : null;

    }

    function encontrarImagem(container) {

      if (!container || !container.length) {
        return null;
      }

      let imagem = null;

      container.find("img").each(
        (i, elemento) => {

          if (imagem) {
            return;
          }

          imagem =
            $(elemento).attr("data-src") ||
            $(elemento).attr("data-lazy-src") ||
            $(elemento).attr("data-original") ||
            $(elemento).attr("src") ||
            null;

        }
      );

      if (!imagem) {

        container.find("source").each(
          (i, elemento) => {

            if (imagem) {
              return;
            }

            const srcset =
              $(elemento).attr("srcset") ||
              $(elemento).attr("data-srcset") ||
              null;

            if (srcset) {

              imagem =
                srcset
                  .split(",")[0]
                  .trim()
                  .split(" ")[0];

            }

          }
        );

      }

      if (!imagem) {
        return null;
      }

      if (
        imagem.startsWith("//")
      ) {
        return "https:" + imagem;
      }

      if (
        imagem.startsWith("/")
      ) {
        return "https://al.senai.br" + imagem;
      }

      return imagem;

    }

    function encontrarUrl(container, titulo) {

      let urlCurso = null;

      if (container && container.length) {

        container.find("a[href]").each(
          (i, elemento) => {

            if (urlCurso) {
              return;
            }

            const href =
              $(elemento).attr("href");

            if (
              href &&
              href.includes("/curso/")
            ) {

              try {

                urlCurso =
                  new URL(
                    href,
                    "https://al.senai.br"
                  ).href;

              } catch {}

            }

          }
        );

      }

      if (urlCurso) {
        return urlCurso;
      }

      return (
        "https://al.senai.br/curso/" +
        normalizarSlug(titulo) +
        "/"
      );

    }

    $("h2, h3, h4, h5").each(
      (index, elemento) => {

        const titulo =
          limparTexto(
            $(elemento).text()
          );

        if (!titulo) {
          return;
        }

        if (
          !titulo
            .toUpperCase()
            .startsWith("TÉCNICO EM")
        ) {
          return;
        }

        if (
          cursosProcessados.has(titulo)
        ) {
          return;
        }

        const containerDados =
          encontrarContainerDados(
            elemento
          );

        const containerVisual =
          encontrarContainerVisual(
            elemento
          );

        const textoDados =
          limparTexto(
            containerDados.text()
          );

        const textoVisual =
          containerVisual
            ? limparTexto(
                containerVisual.text()
              )
            : "";

        const textoCompleto =
          limparTexto(
            textoVisual + " " + textoDados
          );

        const inicioMatch =
          textoCompleto.match(
            /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
          );

        const inicio =
          inicioMatch
            ? inicioMatch[1]
            : null;

        const investimentoMatch =
          textoCompleto.match(
            /Investimento\s*:\s*([\s\S]*?)(?=Confira|$)/i
          );

        const investimento =
          investimentoMatch
            ? limparTexto(
                investimentoMatch[1]
              )
            : null;

        let descricao = "";

        containerDados.find("p").each(
          (i, elementoP) => {

            const textoP =
              limparTexto(
                $(elementoP).text()
              );

            if (!textoP) {
              return;
            }

            if (
              /Início\s*:/i.test(textoP)
            ) {
              return;
            }

            if (
              /Investimento\s*:/i.test(textoP)
            ) {
              return;
            }

            if (
              /Confira/i.test(textoP)
            ) {
              return;
            }

            if (
              textoP.length >
              descricao.length
            ) {
              descricao = textoP;
            }

          }
        );

        const unidade =
          encontrarUnidade(
            containerVisual ||
            containerDados
          );

        const imagem =
          encontrarImagem(
            containerVisual
          );

        const urlCurso =
          encontrarUrl(
            containerVisual ||
            containerDados,
            titulo
          );

        cursosProcessados.add(titulo);

        cursos.push({

          titulo: titulo,

          tipo: "Curso Técnico",

          modalidade:
            "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

          unidade:
            unidade,

          descricao:
            descricao || null,

          inicio:
            inicio,

          investimento:
            investimento,

          imagem:
            imagem,

          url:
            urlCurso

        });

      }
    );
const catalogo = {

  filtros: {

    modalidade:
      "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

    unidades: [
      "POÇO",
      "DISTRITO INDUSTRIAL"
    ]

  },

  cursos: cursos

};

const { error: erroSupabase } =
  await supabase
    .from("catalogos_cursos")
    .upsert(
      {
        id: "senai_tecnicos",

        filtros:
          catalogo.filtros,

        cursos:
          catalogo.cursos,

        atualizado_em:
          new Date().toISOString()

      },
      {
        onConflict: "id"
      }
    );

if (erroSupabase) {

  throw new Error(
    "Erro ao salvar no Supabase: " +
    erroSupabase.message
  );

}
    return res.status(200).json({

  sucesso: true,

  mensagem:
    "Catálogo atualizado com sucesso",

  total:
    cursos.length,

  atualizado_em:
    new Date().toISOString()

      sucesso: true,

      filtros: {

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL"
        ]

      },

      total:
        cursos.length,

      cursos:
        cursos

    });

  } catch (erro) {

    console.error(erro);

    return res.status(500).json({

      sucesso: false,

      erro:
        "Não foi possível consultar os cursos do SENAI.",

      detalhe:
        erro.message

    });

  }

};
