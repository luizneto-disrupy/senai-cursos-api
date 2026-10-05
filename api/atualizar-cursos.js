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
     * 3. FILTROS DO SENAI
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
     * 5. CHEERIO
     * ==========================================
     */

    const $ =
      cheerio.load(html);

    /*
     * Texto completo da página.
     *
     * Aqui removemos a dependência da estrutura
     * dos elementos <p>.
     */

    const textoPagina =
      limparTexto(
        $("body").text()
      );

    /*
     * ==========================================
     * FUNÇÕES AUXILIARES
     * ==========================================
     */

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
     * 6. EXTRAI O BLOCO DE TEXTO DO CURSO
     * ==========================================
     */

    function encontrarBlocoCurso(
      titulo
    ) {

      const posicaoTitulo =
        textoPagina.indexOf(
          titulo
        );

      if (
        posicaoTitulo === -1
      ) {
        return "";
      }

      const inicio =
        posicaoTitulo +
        titulo.length;

      const restante =
        textoPagina.substring(
          inicio
        );

      /*
       * Procuramos o próximo curso.
       */

      const proximoCurso =
        restante.search(
          /TÉCNICO EM [A-ZÁÉÍÓÚÀÂÊÔÃÕÇ0-9]/i
        );

      if (
        proximoCurso === -1
      ) {

        return restante;

      }

      return restante.substring(
        0,
        proximoCurso
      );

    }

    /*
     * ==========================================
     * 7. EXTRAI DESCRIÇÃO
     * ==========================================
     */

    function encontrarDescricao(
      titulo
    ) {

      const bloco =
        encontrarBlocoCurso(
          titulo
        );

      if (!bloco) {
        return null;
      }

      const inicio =
        bloco.search(
          /Início\s*:/i
        );

      if (
        inicio === -1
      ) {
        return null;
      }

      let descricao =
        bloco.substring(
          0,
          inicio
        );

      /*
       * Remove elementos da interface
       * que eventualmente estejam antes
       * da descrição.
       */

      descricao =
        descricao
          .replace(
            /Curso Técnico/gi,
            ""
          )
          .replace(
            /POÇO/gi,
            ""
          )
          .replace(
            /DISTRITO INDUSTRIAL/gi,
            ""
          )
          .replace(
            /Compartilhar lista/gi,
            ""
          )
          .trim();

      descricao =
        limparTexto(
          descricao
        );

      return descricao || null;

    }

    /*
     * ==========================================
     * 8. EXTRAI INVESTIMENTO
     * ==========================================
     */

    function encontrarInvestimento(
      titulo
    ) {

      const bloco =
        encontrarBlocoCurso(
          titulo
        );

      if (!bloco) {
        return null;
      }

      const resultado =
        bloco.match(
          /Investimento\s*:\s*([0-9]+X\s*de\s*R\$\s*[0-9.,]+)/i
        );

      if (
        !resultado
      ) {
        return null;
      }

      return limparTexto(
        resultado[1]
      );

    }

    /*
     * ==========================================
     * 9. LOCALIZA OS TÍTULOS
     * ==========================================
     */

    const titulosCursos =
      [];

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
            !titulosCursos.includes(
              titulo
            )
          ) {

            titulosCursos.push(
              titulo
            );

          }

        }
      );

    /*
     * ==========================================
     * 10. MONTA OS CURSOS
     * ==========================================
     */

    const cursos =
      [];

    titulosCursos.forEach(
      (titulo) => {

        const elementoTitulo =
          $("h2, h3, h4, h5")
            .filter(
              (index, elemento) =>
                limparTexto(
                  $(elemento).text()
                ) === titulo
            )
            .first();

        if (
          !elementoTitulo.length
        ) {
          return;
        }

        const containerVisual =
          encontrarContainerVisual(
            elementoTitulo
          );

        /*
         * Dados principais
         */

        const descricao =
          encontrarDescricao(
            titulo
          );

        const investimento =
          encontrarInvestimento(
            titulo
          );

        /*
         * Início
         */

        const bloco =
          encontrarBlocoCurso(
            titulo
          );

        let inicio =
          null;

        if (bloco) {

          const inicioMatch =
            bloco.match(
              /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
            );

          if (inicioMatch) {

            inicio =
              inicioMatch[1];

          }

        }

        /*
         * Unidade
         */

        let unidade =
          encontrarUnidade(
            containerVisual
          );

        /*
         * Caso não encontre a unidade
         * no container visual, procura no bloco.
         */

        if (!unidade) {

          const blocoMaior =
            encontrarBlocoCurso(
              titulo
            ).toUpperCase();

          const unidades =
            [];

          if (
            blocoMaior.includes(
              "POÇO"
            )
          ) {

            unidades.push(
              "POÇO"
            );

          }

          if (
            blocoMaior.includes(
              "DISTRITO INDUSTRIAL"
            )
          ) {

            unidades.push(
              "DISTRITO INDUSTRIAL"
            );

          }

          unidade =
            unidades.length
              ? unidades.join(
                  ", "
                )
              : null;

        }

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
            containerVisual,
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
     * 11. REMOVE DUPLICIDADES
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
     * 12. VALIDAÇÃO
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
     * 13. CATÁLOGO
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
     * 14. SUPABASE
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
     * 15. SUCESSO
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
