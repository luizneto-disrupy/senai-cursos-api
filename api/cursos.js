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
      erro: "Método não permitido"
    });
  }

  try {

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

    const url = `https://al.senai.br/cursos/?${params.toString()}`;

    const resposta = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!resposta.ok) {
      throw new Error(
        `SENAI retornou status ${resposta.status}`
      );
    }

    const html = await resposta.text();

    const $ = cheerio.load(html);

    const cursos = [];
    const urlsProcessadas = new Set();

    /*
     * Procuramos links que apontam para páginas individuais
     * de cursos.
     */
    $('a[href*="/curso/"]').each((index, elemento) => {

      const link = $(elemento).attr("href");

      if (!link) return;

      const urlCurso = new URL(
        link,
        "https://al.senai.br"
      ).href;

      if (urlsProcessadas.has(urlCurso)) {
        return;
      }

      urlsProcessadas.add(urlCurso);

      /*
       * Procuramos um elemento pai que tenha informações
       * suficientes para representar o card.
       */
      let card = $(elemento);

      for (let i = 0; i < 8; i++) {

        card = card.parent();

        if (!card.length) break;

        const texto = card.text(" ");

        const possuiTitulo =
          card.find("h2,h3,h4").length > 0;

        const possuiConfira =
          /Confira/i.test(texto);

        if (
          possuiTitulo &&
          possuiConfira &&
          texto.length > 80
        ) {
          break;
        }
      }

      const titulo =
        card
          .find("h2,h3,h4")
          .first()
          .text()
          .trim()
          .replace(/\s+/g, " ");

      if (!titulo) {
        return;
      }

      const textoCard = card
        .text(" ")
        .replace(/\s+/g, " ")
        .trim();

      /*
       * Descrição
       */
      let descricao = "";

      card.find("p").each((i, p) => {

        const texto = $(p)
          .text()
          .replace(/\s+/g, " ")
          .trim();

        if (
          texto &&
          !/Início:/i.test(texto) &&
          !/Investimento:/i.test(texto) &&
          texto.length > descricao.length
        ) {
          descricao = texto;
        }

      });

      /*
       * Data de início
       */
      const inicioMatch = textoCard.match(
        /Início:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
      );

      const inicio = inicioMatch
        ? inicioMatch[1]
        : null;

      /*
       * Investimento
       */
      const investimentoMatch = textoCard.match(
        /Investimento:\s*([\s\S]*?)(?=Confira|$)/i
      );

      let investimento =
        investimentoMatch
          ? investimentoMatch[1]
              .replace(/\s+/g, " ")
              .trim()
          : "";

      /*
       * Unidade
       */
      let unidade = "";

      if (/DISTRITO INDUSTRIAL/i.test(textoCard)) {
        unidade = "DISTRITO INDUSTRIAL";
      }

      if (/POÇO/i.test(textoCard)) {

        if (unidade) {
          unidade = "POÇO, DISTRITO INDUSTRIAL";
        } else {
          unidade = "POÇO";
        }
      }

      /*
       * Imagem
       */
      let imagem = null;

      const imagemElemento =
        card.find("img").first();

      if (imagemElemento.length) {

        imagem =
          imagemElemento.attr("data-src") ||
          imagemElemento.attr("src") ||
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
        titulo,
        descricao,
        unidade,
        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",
        inicio,
        investimento,
        imagem,
        url: urlCurso
      });

    });

    /*
     * Remove duplicidades pelo endereço do curso.
     */
    const cursosFinais = cursos.filter(
      (curso, index, array) =>
        index ===
        array.findIndex(
          item => item.url === curso.url
        )
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

      total: cursosFinais.length,

      cursos: cursosFinais

    });

  } catch (erro) {

    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Não foi possível consultar os cursos do SENAI.",
      detalhe: erro.message
    });

  }

};
