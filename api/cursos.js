const cheerio = require("cheerio");

module.exports = async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=86400"
  );

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

    /*
     * Variáveis do Supabase
     */

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl) {

      return res.status(500).json({
        sucesso: false,
        erro:
          "SUPABASE_URL não configurado no Vercel"
      });

    }

    if (!supabaseSecretKey) {

      return res.status(500).json({
        sucesso: false,
        erro:
          "SUPABASE_SECRET_KEY não configurado no Vercel"
      });

    }

    /*
     * URL da API REST do Supabase
     */

    const baseSupabaseUrl =
      supabaseUrl.replace(
        /\/$/,
        ""
      );

    const endpoint =
      baseSupabaseUrl +
      "/rest/v1/catalogos_cursos" +
      "?id=eq.senai_tecnicos" +
      "&select=id,filtros,cursos,atualizado_em";

    /*
     * Consulta o catálogo salvo
     */

    const resposta =
      await fetch(
        endpoint,
        {
          method: "GET",

          headers: {
            apikey:
              supabaseSecretKey,

            Authorization:
              `Bearer ${supabaseSecretKey}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    /*
     * Lemos como texto primeiro para
     * evitar erro em caso de resposta inesperada
     */

    const texto =
      await resposta.text();

    if (!resposta.ok) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Erro ao consultar o Supabase",

        status:
          resposta.status,

        detalhe:
          texto.substring(
            0,
            2000
          )

      });

    }

    let dados;

    try {

      dados =
        JSON.parse(texto);

    } catch {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Supabase não retornou JSON",

        detalhe:
          texto.substring(
            0,
            2000
          )

      });

    }

    /*
     * A API retorna um array.
     */

    if (
      !Array.isArray(dados) ||
      dados.length === 0
    ) {

      return res.status(404).json({

        sucesso: false,

        erro:
          "Catálogo de cursos não encontrado no Supabase"

      });

    }

    const catalogo =
      dados[0];

    const cursos =
      Array.isArray(
        catalogo.cursos
      )
        ? catalogo.cursos
        : [];

    /*
     * Validação de segurança.
     */

    if (
      cursos.length === 0
    ) {

      return res.status(404).json({

        sucesso: false,

        erro:
          "O catálogo existe, mas não possui cursos"

      });

    }

    /*
     * Retorno para o RD Station
     */

    return res.status(200).json({

      sucesso: true,

      filtros:
        catalogo.filtros,

      total:
        cursos.length,

      atualizado_em:
        catalogo.atualizado_em,

      cursos:
        cursos

    });

  } catch (erro) {

    console.error(
      "ERRO AO CONSULTAR CURSOS:",
      erro
    );

    return res.status(500).json({

      sucesso: false,

      erro:
        "Não foi possível consultar o catálogo",

      detalhe:
        erro.message

    });

  }

};
