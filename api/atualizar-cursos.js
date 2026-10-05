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
     * Segurança do endpoint.
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
     * Variáveis de ambiente.
     */

    const scrapingBeeKey =
      process.env.SCRAPINGBEE_API_KEY;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    /*
     * Validação.
     */

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
     * Filtros do SENAI.
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
     * Consulta pelo ScrapingBee.
     *
     * Auto Mode tenta primeiro as configurações
     * mais baratas e escala até 25 créditos.
     *
     * O limite de 25 impede o uso do modo stealth,
     * que custa 75 créditos.
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

    /*
     * Lemos a resposta como texto.
     * Isso permite retornar mensagens úteis
     * quando o ScrapingBee falhar.
     */

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
     * Carrega o HTML.
     */

    const $ =
      cheerio.load(html);

    const cursos = [];

    const cursosProcessados =
      new Set();

    /*
     * Limpa textos.
     */

    function limparTexto(valor) {

      return String(valor || "")
        .replace(/\s+/g, " ")
        .trim();

    }

    /*
     * Cria slug.
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
     * Encontra o container dos dados.
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
     * Encontra o container visual.
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
     * Encontra a unidade.
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
     * Encontra a imagem.
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
     * Encontra a URL do curso.
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
     * Procura os títulos dos cursos.
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

          /*
           * Containers.
           */

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
           * Início.
           */

          const inicioMatch =
            textoCompleto.match(
              /Início\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
            );

          const inicio =
            inicioMatch
              ? inicioMatch[1]
              : null;

          /*
           * Investimento.
           */

          const investimentoMatch =
            textoCompleto.match(
              /Investimento\s*:\s*([\s\S]*?)(?=Confira|$)/i
            );

          const investimento =
            investimentoMatch
              ? limparTexto(
                  investimentoMatch[1]
                )
              : null;

          /*
           * Descrição.
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
           * Unidade.
           */

          const unidade =
            encontrarUnidade(
              containerVisual ||
              containerDados
            );

          /*
           * Imagem.
           */

          const imagem =
            encontrarImagem(
              containerVisual
            );

          /*
           * URL.
           */

          const urlCurso =
            encontrarUrl(
              containerVisual ||
              containerDados,
              titulo
            );

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

    /*
     * Segurança.
     */

    if (
      cursos.length === 0
    ) {

      return res.status(500).json({

        sucesso: false,

        erro:
          "Nenhum curso foi encontrado no HTML recebido do SENAI."

      });

    }

    /*
     * Catálogo que será salvo.
     */

    const catalogo = {

      id:
        "senai_tecnicos",

      filtros: {

        modalidade:
          "HABILITAÇÃO TÉCNICA DE NÍVEL MÉDIO",

        unidades: [
          "POÇO",
          "DISTRITO INDUSTRIAL"
        ]

      },

      cursos:
        cursos,

      atualizado_em:
        new Date().toISOString()

    };

    /*
     * Endpoint REST do Supabase.
     */

    const baseSupabaseUrl =
      supabaseUrl.replace(
        /\/$/,
        ""
      );

    const supabaseEndpoint =
      baseSupabaseUrl +
      "/rest/v1/catalogos_cursos";

    /*
     * Salva ou atualiza o catálogo.
     */

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
     * Sucesso.
     */

    return res.status(200).json({

      sucesso:
        true,

      mensagem:
        "Catálogo atualizado com sucesso",

      total:
        cursos.length,

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
