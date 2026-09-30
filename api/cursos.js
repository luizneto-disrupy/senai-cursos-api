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

    const dados =
      await resposta.json();

    if (!resposta.ok) {

      return res.status(500).json({

        sucesso: false,

        erro: "Browserless retornou erro",

        status: resposta.status,

        detalhe: dados

      });

    }

    const html =
      dados.content || "";

    if (!html) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Browserless não retornou o HTML da página.",

        resposta: dados

      });

    }

    const $ =
      cheerio.load(html);

    const titulo =
      $("title")
        .first()
        .text()
        .trim();

    const texto =
      $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim();

    return res.status(200).json({

      sucesso: true,

      urlConsultada: url,

      titulo,

      tamanhoHtml: html.length,

      tamanhoTexto: texto.length,

      inicioTexto:
        texto.substring(0, 3000)

    });

  } catch (erro) {

    console.error(erro);

    return res.status(500).json({

      sucesso: false,

      erro: erro.message

    });

  }

};
