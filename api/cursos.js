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
      "https://production-sfo.browserless.io/function" +
      "?token=" +
      encodeURIComponent(token) +
      "&proxy=residential";

    const codigo = `
      export default async ({ page }) => {

        await page.goto("${url}", {
          waitUntil: "networkidle2",
          timeout: 45000
        });

        await new Promise(resolve =>
          setTimeout(resolve, 5000)
        );

        const resultado = await page.evaluate(() => {

          return {
            titulo: document.title,
            url: window.location.href,
            texto: document.body.innerText
          };

        });

        return {
          data: JSON.stringify(resultado),
          type: "application/json"
        };
      };
    `;

    const resposta = await fetch(browserlessUrl, {

      method: "POST",

      headers: {
        "Content-Type": "application/javascript"
      },

      body: codigo

    });

    const textoResposta =
      await resposta.text();

    if (!resposta.ok) {

      return res.status(500).json({
        sucesso: false,
        erro: "Browserless retornou erro",
        status: resposta.status,
        detalhe: textoResposta
      });

    }

    let resultado;

    try {
      resultado =
        JSON.parse(textoResposta);
    } catch {

      resultado = {
        resposta: textoResposta
      };

    }

    return res.status(200).json({
      sucesso: true,
      urlConsultada: url,
      resultado: resultado
    });

  } catch (erro) {

    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });

  }

};
