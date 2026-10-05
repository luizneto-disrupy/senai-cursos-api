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
     * Segurança do endpoint
     */

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

    /*
     * Variáveis de ambiente
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
     * Filtros do SENAI
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
     * ScrapingBee
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

    const resposta =
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
      await resposta.text();

    if (!resposta.ok) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "ScrapingBee retornou erro",

        status:
          resposta.status,

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
          "ScrapingBee não retornou HTML"

      });

    }

    /*
     * Carrega o HTML
     */

    const $ =
      cheerio.load(html);

    /*
     * Texto completo da página
     *
     * Esse texto será usado como fallback
     * para descrição e investimento.
     */

    const textoPagina =
      limparTexto(
        $("body").text()
      );

    /*
     * Função para limpar textos
     */

    function limparTexto(valor) {

      return String(valor || "")
        .replace(/\s+/g, " ")
        .trim();

    }

    /*
     * Normalização de slug
     */

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
          " "
        )
        .trim()
        .replace(
          /\s+/g,
          "-"
        );

    }

    /*
     * Encontra o container de dados
     */

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

    /*
     * Encontra o container visual
     */

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

    /*
     * Unidade
     */

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

    /*
     * Imagem
     */

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

    /*
     * URL do curso
     */

    function encontrarUrl(
      container,
      titulo
    ) {

      let urlCurso =
        null;

      if (
        container &&
        container.length
      ) {

        container
          .find("a[href]")
          .each(
            (i, elemento) => {

              if (urlCurso) {
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
        normalizarSlug(
          titulo
        ) +
        "/"
      );

    }

    /*
     * Extrai descrição diretamente
     * do texto global da página.
     */

    function encontrarDescricaoGlobal(
      titulo
    ) {

      const inicioTitulo =
        textoPagina.indexOf(
          titulo
        );

      if (
        inicioTitulo === -1
      ) {
        return null;
      }

      const inicioDados =
        inicioTitulo +
        titulo.length;

      const trecho =
        textoPagina.substring(
          inicioDados
        );

      const inicioIndex =
        trecho.search(
          /Início\s*:/i
        );

      if (
        inicioIndex === -1
      ) {
        return null;
      }

      let descricao =
        trecho.substring(
          0,
          inicioIndex
        );

      /*
       * Remove textos que possam ter vindo
       * do próprio layout.
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
          .trim();

      return limparTexto(
        descricao
      );

    }

    /*
     * Extrai investimento diretamente
     * do texto global.
     */

    function encontrarInvestimentoGlobal(
      titulo
    ) {

      const inicioTitulo =
        textoPagina.indexOf(
          titulo
        );

      if (
        inicioTitulo === -1
      ) {
        return null;
      }

      const trecho =
        textoPagina.substring(
          inicioTitulo
        );

      const resultado =
        trecho.match(
          /Investimento\s*:\s*(.*?)\s*(?:Confira|Curso Técnico|TÉCNICO EM|$)/i
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
     * Primeiro coletamos todos os títulos.
     *
     * Isso também permite saber onde termina
     * um curso e começa o próximo.
     */

    const titulosCursos = [];

    $("h2, h3, h4, h5")
      .each(
        (index, elemento) => {

          const titulo =
            limparTexto(
              $(elemento).text()
            );

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
     * Extrai cada curso.
     */

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

        const containerDados =
          encontrarContainerDados(
            elementoTitulo
          );

        const containerVisual =
          encontrarContainerVisual(
            elementoTitulo
          );

        const textoCard =
          limparTexto(
            containerDados.text()
          );

        /*
         * Início
         */

        let inicio =
          null;

        const inicioMatch =
          textoCard.match(
            /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
          );

        if (
          inicioMatch
        ) {

          inicio =
            inicioMatch[1];

        }

        /*
         * Investimento
         */

        let investimento =
          null;

        const investimentoCardMatch =
          textoCard.match(
            /Investimento\s*:\s*(.*?)(?:Confira|$)/i
          );

        if (
          investimentoCardMatch
        ) {

          investimento =
            limparTexto(
              investimentoCardMatch[1]
            );

        }

        if (
          !investimento
        ) {

          investimento =
            encontrarInvestimentoGlobal(
              titulo
            );

        }

        /*
         * Descrição
         */

        let descricao =
          "";

        containerDados
          .find("p")
          .each(
            (i, elementoP) => {

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
                textoP.length >
                descricao.length
              ) {

                descricao =
                  textoP;

              }

            }
          );

        /*
         * Fallback global para descrição.
         */

        if (
          !descricao
        ) {

          descricao =
            encontrarDescricaoGlobal(
              titulo
            ) || "";

        }

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
            descricao || null,

          inicio:
            inicio,

          investimento:
            investimento || null,

          imagem:
            imagem,

          url:
            urlCurso

        });

      }
    );

    /*
     * Remove duplicidades.
     */

    const cursosFinais =
      cursos.filter(
        (curso, index, array) =>
          index ===
          array.findIndex(
            item =>
              item.url ===
              curso.url
          )
      );

    /*
     * Garante que não estamos salvando
     * uma resposta vazia.
     */

    if (
      cursosFinais.length === 0
    ) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Nenhum curso foi encontrado"

      });

    }

    /*
     * Catálogo
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
     * Supabase
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
     * Resultado final
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
