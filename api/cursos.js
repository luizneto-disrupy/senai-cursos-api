const cheerio = require("cheerio");

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    }

    function extrairImagem(container) {

      let imagem = null;

      container.find("img").each((i, elemento) => {

        if (imagem) {
          return;
        }

        imagem =
          $(elemento).attr("data-src") ||
          $(elemento).attr("data-lazy-src") ||
          $(elemento).attr("data-original") ||
          $(elemento).attr("src") ||
          null;

      });

      if (!imagem) {

        container.find("source").each((i, elemento) => {

          if (imagem) {
            return;
          }

          imagem =
            $(elemento).attr("data-srcset") ||
            $(elemento).attr("srcset") ||
            null;

          if (imagem) {

            imagem =
              imagem
                .split(",")[0]
                .trim()
                .split(" ")[0];

          }

        });

      }

      if (!imagem) {

        container.find("*").each((i, elemento) => {

          if (imagem) {
            return;
          }

          const style =
            $(elemento).attr("style") || "";

          const match =
            style.match(
              /background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i
            );

          if (match) {
            imagem = match[1];
          }

        });

      }

      if (!imagem) {
        return null;
      }

      if (imagem.startsWith("//")) {
        return "https:" + imagem;
      }

      if (imagem.startsWith("/")) {
        return "https://al.senai.br" + imagem;
      }

      return imagem;

    }

    function encontrarUnidade(container) {

      const unidadesPossiveis = [
        "POÇO",
        "DISTRITO INDUSTRIAL"
      ];

      let unidadeEncontrada = [];

      container
        .find("*")
        .each((i, elemento) => {

          const texto =
            limparTexto($(elemento).text())
              .toUpperCase();

          if (
            texto === "POÇO" &&
            !unidadeEncontrada.includes("POÇO")
          ) {
            unidadeEncontrada.push("POÇO");
          }

          if (
            texto === "DISTRITO INDUSTRIAL" &&
            !unidadeEncontrada.includes("DISTRITO INDUSTRIAL")
          ) {
            unidadeEncontrada.push("DISTRITO INDUSTRIAL");
          }

        });

      if (unidadeEncontrada.length) {
        return unidadeEncontrada.join(", ");
      }

      const textoCompleto =
        limparTexto(container.text())
          .toUpperCase();

      const resultado = [];

      unidadesPossiveis.forEach(unidade => {

        if (textoCompleto.includes(unidade)) {
          resultado.push(unidade);
        }

      });

      return resultado.join(", ");

    }

    function encontrarUrl(container, titulo) {

      let urlCurso = null;

      container
        .find("a[href]")
        .each((i, elemento) => {

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

        });

      if (urlCurso) {
        return urlCurso;
      }

      return (
        "https://al.senai.br/curso/" +
        normalizarSlug(titulo) +
        "/"
      );

    }

    /*
     * Procuramos h2, h3, h4 e h5.
     * Isso evita depender de uma única marca HTML.
     */

    $("h2, h3, h4, h5").each(
      (index, elemento) => {

        const titulo =
          limparTexto($(elemento).text());

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

        if (cursosProcessados.has(titulo)) {
          return;
        }

        let atual = $(elemento);
        const candidatos = [];

        /*
         * Procuramos vários níveis acima do título.
         * Não exigimos que exista exatamente um h3.
         */

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

            candidatos.push(atual);

          }

        }

        if (!candidatos.length) {
          return;
        }

        /*
         * Escolhemos o menor container que contém
         * as informações do curso.
         */

        candidatos.sort(
          (a, b) =>
            limparTexto(a.text()).length -
            limparTexto(b.text()).length
        );

        const card =
          candidatos[0];

        const textoCard =
          limparTexto(card.text());

        const unidade =
          encontrarUnidade(card);

        const inicioMatch =
          textoCard.match(
            /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
          );

        const inicio =
          inicioMatch
            ? inicioMatch[1]
            : null;

        const investimentoMatch =
          textoCard.match(
            /Investimento\s*:\s*([\s\S]*?)(?=Confira|$)/i
          );

        const investimento =
          investimentoMatch
            ? limparTexto(
                investimentoMatch[1]
              )
            : null;

        let descricao = "";

        card.find("p").each(
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
              textoP.length > descricao.length
            ) {
              descricao = textoP;
            }

          }
        );

        const urlCurso =
          encontrarUrl(
            card,
            titulo
          );

        const imagem =
          extrairImagem(card);

        cursosProcessados.add(titulo);

        cursos.push({

          titulo: titulo,

          tipo: "Curso Técnico",

          modalidade:
            "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

          unidade:
            unidade || null,

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

    return res.status(200).json({

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
