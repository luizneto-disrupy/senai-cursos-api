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
    const urlsProcessadas = new Set();

    $("a[href*='/curso/']").each((index, elemento) => {

      const href = $(elemento).attr("href");

      if (!href) {
        return;
      }

      let urlCurso;

      try {

        urlCurso = new URL(
          href,
          "https://al.senai.br"
        ).href;

      } catch {

        return;

      }

      if (urlsProcessadas.has(urlCurso)) {
        return;
      }

      urlsProcessadas.add(urlCurso);

      let atual = $(elemento);
      let card = null;

      for (let nivel = 0; nivel < 10; nivel++) {

        atual = atual.parent();

        if (!atual || !atual.length) {
          break;
        }

        const texto = atual
          .text(" ")
          .replace(/\s+/g, " ")
          .trim();

        const titulos =
          atual.find("h1,h2,h3,h4,h5");

        const temInicio =
          /Início\s*:/i.test(texto);

        const temInvestimento =
          /Investimento\s*:/i.test(texto);

        const quantidadeTitulos =
          titulos.length;

        if (
          quantidadeTitulos === 1 &&
          temInicio &&
          temInvestimento &&
          texto.length > 100 &&
          texto.length < 1800
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
          .text(" ")
          .replace(/\s+/g, " ")
          .trim();

      const titulo =
        card
          .find("h1,h2,h3,h4,h5")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();

      if (!titulo) {
        return;
      }

      let unidade = "";

      if (/POÇO/i.test(textoCard)) {
        unidade = "POÇO";
      }

      if (/DISTRITO INDUSTRIAL/i.test(textoCard)) {

        unidade = unidade
          ? "POÇO, DISTRITO INDUSTRIAL"
          : "DISTRITO INDUSTRIAL";

      }

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
          /Investimento\s*:\s*(.*?)(?=Confira|$)/i
        );

      const investimento =
        investimentoMatch
          ? investimentoMatch[1]
              .replace(/\s+/g, " ")
              .trim()
          : null;

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

      let imagem = null;

      const elementoImagem =
        card.find("img").first();

      if (elementoImagem.length) {

        imagem =
          elementoImagem.attr("data-src") ||
          elementoImagem.attr("data-lazy-src") ||
          elementoImagem.attr("src") ||
          null;

        if (
          imagem &&
          imagem.startsWith("//")
        ) {
          imagem = "https:" + imagem;
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

      cursos.push({

        titulo: titulo,

        tipo: "Curso Técnico",

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidade: unidade,

        descricao: descricao,

        inicio: inicio,

        investimento: investimento,

        imagem: imagem,

        url: urlCurso

      });

    });

    const cursosFinais =
      cursos.filter((curso, index, array) => {

        return (
          index ===
          array.findIndex(
            item =>
              item.url === curso.url
          )
        );

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

      total: cursosFinais.length,

      cursos: cursosFinais

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
