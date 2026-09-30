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

    $("h3").each((index, elemento) => {

      const titulo =
        $(elemento)
          .text()
          .replace(/\s+/g, " ")
          .trim();

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
      let card = null;

      for (let nivel = 0; nivel < 10; nivel++) {

        atual = atual.parent();

        if (!atual || !atual.length) {
          break;
        }

        const texto =
          atual
            .text()
            .replace(/\s+/g, " ")
            .trim();

        const quantidadeH3 =
          atual.find("h3").length;

        const temInicio =
          /Início\s*:/i.test(texto);

        const temInvestimento =
          /Investimento\s*:/i.test(texto);

        if (
          quantidadeH3 === 1 &&
          temInicio &&
          temInvestimento &&
          texto.length > 100 &&
          texto.length < 2000
        ) {

          card = atual;
          break;

        }

      }

      if (!card) {
        return;
      }

      const textoCard =
        card
          .text()
          .replace(/\s+/g, " ")
          .trim();

      const unidades = [];

      if (/POÇO/i.test(textoCard)) {
        unidades.push("POÇO");
      }

      if (/DISTRITO INDUSTRIAL/i.test(textoCard)) {
        unidades.push("DISTRITO INDUSTRIAL");
      }

      let descricao = "";

      card.find("p").each((i, elementoP) => {

        const textoP =
          $(elementoP)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        if (!textoP) {
          return;
        }

        if (/Início\s*:/i.test(textoP)) {
          return;
        }

        if (/Investimento\s*:/i.test(textoP)) {
          return;
        }

        if (/Confira/i.test(textoP)) {
          return;
        }

        if (textoP.length > descricao.length) {
          descricao = textoP;
        }

      });

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
          ? investimentoMatch[1]
              .replace(/\s+/g, " ")
              .trim()
          : null;

      let urlCurso = null;

      card.find("a").each((i, link) => {

        const href =
          $(link).attr("href");

        if (!href) {
          return;
        }

        if (href.includes("/curso/")) {

          try {

            urlCurso =
              new URL(
                href,
                "https://al.senai.br"
              ).href;

          } catch {}

        }

      });

      let imagem = null;

      const elementoImagem =
        card.find("img").first();

      if (elementoImagem.length) {

        imagem =
          elementoImagem.attr("data-src") ||
          elementoImagem.attr("data-lazy-src") ||
          elementoImagem.attr("src") ||
          elementoImagem.attr("data-original") ||
          null;

        if (
          imagem &&
          imagem.startsWith("//")
        ) {
          imagem =
            "https:" + imagem;
        }

        if (
          imagem &&
          imagem.startsWith("/")
        ) {
          imagem =
            "https://al.senai.br" +
            imagem;
        }

      }

      cursosProcessados.add(titulo);

      cursos.push({

        titulo: titulo,

        tipo: "Curso Técnico",

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidade:
          unidades.join(", "),

        descricao:
          descricao,

        inicio:
          inicio,

        investimento:
          investimento,

        imagem:
          imagem,

        url:
          urlCurso

      });

    });

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
