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
     * ==========================================
     * 1. AUTENTICAÇÃO
     * ==========================================
     */

    const authorization =
      req.headers.authorization || "";

    const cronSecret =
      process.env.CRON_SECRET || "";

    if (
      !cronSecret ||
      authorization !==
        `Bearer ${cronSecret}`
    ) {

      return res.status(401).json({
        sucesso: false,
        erro: "Não autorizado"
      });

    }

    /*
     * ==========================================
     * 2. VARIÁVEIS DE AMBIENTE
     * ==========================================
     */

    const scrapingBeeKey =
      process.env.SCRAPINGBEE_API_KEY;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!scrapingBeeKey) {

      return res.status(500).json({
        sucesso: false,
        erro:
          "SCRAPINGBEE_API_KEY não configurado no Vercel"
      });

    }

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
     * ==========================================
     * 3. URL FILTRADA DO SENAI
     * ==========================================
     */

    const params =
      new URLSearchParams();

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

    /*
     * ==========================================
     * 4. CONSULTA SCRAPINGBEE
     * ==========================================
     */

    const scrapingBeeParams =
      new URLSearchParams();

    scrapingBeeParams.set(
      "url",
      url
    );

    scrapingBeeParams.set(
      "mode",
      "auto"
    );

    scrapingBeeParams.set(
      "max_cost",
      "25"
    );

    scrapingBeeParams.set(
      "country_code",
      "br"
    );

    scrapingBeeParams.set(
      "wait_for",
      "h3"
    );

    const scrapingBeeUrl =
      "https://app.scrapingbee.com/api/v1/?" +
      scrapingBeeParams.toString();

    const respostaScraping =
      await fetch(
        scrapingBeeUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${scrapingBeeKey}`
          }
        }
      );

    const html =
      await respostaScraping.text();

    if (!respostaScraping.ok) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "ScrapingBee retornou erro",

        status:
          respostaScraping.status,

        detalhe:
          html.substring(
            0,
            2000
          )

      });

    }

    if (!html) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "ScrapingBee não retornou conteúdo"

      });

    }

    /*
     * ==========================================
     * 5. PROCESSAMENTO DO HTML
     * ==========================================
     */

    const $ =
      cheerio.load(html);

    const cursos = [];

    const cursosProcessados =
      new Set();

    function limparTexto(valor) {

      return String(valor || "")
        .replace(/\s+/g, " ")
        .trim();

    }

    function normalizarSlug(titulo) {

      return titulo
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          "");

    }

    function encontrarContainerDados(
      elemento
    ) {

      let atual =
        $(elemento);

      for (
        let nivel = 0;
        nivel < 12;
        nivel++
      ) {

        atual =
          atual.parent();

        if (
          !atual ||
          !atual.length
        ) {
          break;
        }

        const texto =
          limparTexto(
            atual.text()
          );

        const temInicio =
          /Início\s*:/i.test(
            texto
          );

        const temInvestimento =
          /Investimento\s*:/i.test(
            texto
          );

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

    function encontrarContainerVisual(
      elemento
    ) {

      let atual =
        $(elemento);

      for (
        let nivel = 0;
        nivel < 12;
        nivel++
      ) {

        atual =
          atual.parent();

        if (
          !atual ||
          !atual.length
        ) {
          break;
        }

        const texto =
          limparTexto(
            atual.text()
          );

        const temCursoTecnico =
          /Curso Técnico/i.test(
            texto
          );

        const temUnidade =
          /POÇO|DISTRITO INDUSTRIAL/i.test(
            texto
          );

        const possuiImagem =
          atual.find(
            "img"
          ).length > 0;

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

    function encontrarUnidade(
      container
    ) {

      if (
        !container ||
        !container.length
      ) {
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

        unidades.push(
          "POÇO"
        );

      }

      if (
        texto.includes(
          "DISTRITO INDUSTRIAL"
        )
      ) {

        unidades.push(
          "DISTRITO INDUSTRIAL"
        );

      }

      return unidades.length
        ? unidades.join(", ")
        : null;

    }

    function encontrarImagem(
      container
    ) {

      if (
        !container ||
        !container.length
      ) {
        return null;
      }

      let imagem =
        null;

      container
        .find("img")
        .each(
          (i, elemento) => {

            if (imagem) {
              return;
            }

            imagem =
              $(elemento).attr(
                "data-src"
              ) ||
              $(elemento).attr(
                "data-lazy-src"
              ) ||
              $(elemento).attr(
                "data-original"
              ) ||
              $(elemento).attr(
                "src"
              ) ||
              null;

          }
        );

      if (!imagem) {

        container
          .find("source")
          .each(
            (i, elemento) => {

              if (imagem) {
                return;
              }

              const srcset =
                $(elemento).attr(
                  "srcset"
                ) ||
                $(elemento).attr(
                  "data-srcset"
                ) ||
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

        return (
          "https:" +
          imagem
        );

      }

      if (
        imagem.startsWith("/")
      ) {

        return (
          "https://al.senai.br" +
          imagem
        );

      }

      return imagem;

    }

    function encontrarUrl(
      container,
      titulo
    ) {

      if (
        container &&
        container.length
      ) {

        let urlEncontrada =
          null;

        container
          .find("a[href]")
          .each(
            (i, elemento) => {

              if (urlEncontrada) {
                return;
              }

              const href =
                $(elemento).attr(
                  "href"
                );

              if (
                href &&
                href.includes(
                  "/curso/"
                )
              ) {

                try {

                  urlEncontrada =
                    new URL(
                      href,
                      "https://al.senai.br"
                    ).href;

                } catch {}

              }

            }
          );

        if (urlEncontrada) {
          return urlEncontrada;
        }

      }

      return (
        "https://al.senai.br/curso/" +
        normalizarSlug(
          titulo
        ) +
        "/"
      );

    }

    /*
     * ==========================================
     * 6. EXTRAÇÃO DOS CURSOS
     * ==========================================
     */

    $("h2, h3, h4, h5")
      .each(
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
              .startsWith(
                "TÉCNICO EM"
              )
          ) {
            return;
          }

          if (
            cursosProcessados.has(
              titulo
            )
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
              textoVisual +
              " " +
              textoDados
            );

          /*
           * Início
           */

          let inicio =
            null;

          const inicioMatch =
            textoCompleto.match(
              /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
            );

          if (inicioMatch) {

            inicio =
              inicioMatch[1];

          }

          /*
           * Investimento
           */

          let investimento =
            null;

          const investimentoMatch =
            textoCompleto.match(
              /Investimento\s*:\s*(.*?)(?=Confira|$)/i
            );

          if (investimentoMatch) {

            investimento =
              limparTexto(
                investimentoMatch[1]
              );

          }

          /*
           * Descrição
           */

          let descricao =
            null;

          const paragrafos =
            containerDados.find(
              "p"
            );

          paragrafos.each(
            (i, elementoP) => {

              if (descricao) {
                return;
              }

              const textoP =
                limparTexto(
                  $(elementoP).text()
                );

              if (!textoP) {
                return;
              }

              if (
                /Início\s*:/i.test(
                  textoP
                )
              ) {
                return;
              }

              if (
                /Investimento\s*:/i.test(
                  textoP
                )
              ) {
                return;
              }

              if (
                /Confira/i.test(
                  textoP
                )
              ) {
                return;
              }

              if (
                textoP.length >= 20
              ) {

                descricao =
                  textoP;

              }

            }
          );

          /*
           * Unidade
           */

          const unidade =
            encontrarUnidade(
              containerVisual ||
              containerDados
            );

          /*
           * Imagem
           */

          const imagem =
            encontrarImagem(
              containerVisual
            );

          /*
           * URL
           */

          const urlCurso =
            encontrarUrl(
              containerVisual ||
              containerDados,
              titulo
            );

          /*
           * Adiciona o curso
           */

          cursosProcessados.add(
            titulo
          );

          cursos.push({

            titulo:
              titulo,

            tipo:
              "Curso Técnico",

            modalidade:
              "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

            unidade:
              unidade,

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

        }
      );

    /*
     * ==========================================
     * 7. REMOVE DUPLICIDADES
     * ==========================================
     */

    const cursosFinais =
      cursos.filter(
        (curso, index, array) => {

          return (
            index ===
            array.findIndex(
              outroCurso =>
                outroCurso.url ===
                curso.url
            )
          );

        }
      );

    /*
     * ==========================================
     * 8. VALIDAÇÃO
     * ==========================================
     */

    if (
      cursosFinais.length === 0
    ) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Nenhum curso foi encontrado no HTML do SENAI"

      });

    }

    /*
     * ==========================================
     * 9. MONTA CATÁLOGO
     * ==========================================
     */

    const catalogo = {

      id:
        "senai_tecnicos",

      filtros: {

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL"
        ],

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO"

      },

      cursos:
        cursosFinais,

      atualizado_em:
        new Date().toISOString()

    };

    /*
     * ==========================================
     * 10. SALVA NO SUPABASE
     * ==========================================
     */

    const baseSupabaseUrl =
      supabaseUrl.replace(
        /\/$/,
        ""
      );

    const supabaseEndpoint =
      baseSupabaseUrl +
      "/rest/v1/catalogos_cursos";

    const respostaSupabase =
      await fetch(
        supabaseEndpoint,
        {

          method:
            "POST",

          headers: {

            apikey:
              supabaseSecretKey,

            Authorization:
              `Bearer ${supabaseSecretKey}`,

            "Content-Type":
              "application/json",

            Prefer:
              "resolution=merge-duplicates,return=minimal"

          },

          body:
            JSON.stringify(
              catalogo
            )

        }
      );

    const textoSupabase =
      await respostaSupabase.text();

    if (
      !respostaSupabase.ok
    ) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Erro ao salvar catálogo no Supabase",

        status:
          respostaSupabase.status,

        detalhe:
          textoSupabase.substring(
            0,
            2000
          )

      });

    }

    /*
     * ==========================================
     * 11. SUCESSO
     * ==========================================
     */

    return res.status(200).json({

      sucesso:
        true,

      mensagem:
        "Catálogo atualizado com sucesso",

      total:
        cursosFinais.length,

      atualizado_em:
        catalogo.atualizado_em

    });

  } catch (erro) {

    console.error(
      "ERRO ATUALIZAR CURSOS:",
      erro
    );

    return res.status(500).json({

      sucesso:
        false,

      erro:
        "Não foi possível atualizar o catálogo",

      detalhe:
        erro.message

    });

  }

};
