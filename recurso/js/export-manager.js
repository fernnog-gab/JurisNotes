/* ================================================
   export-manager.js
   Módulo de Formatação e Exportação: Markdown + Imagens
   Arquitetura: "Roteiro do Diretor" para o Mestre de Gabinete
   Versão: 3.1.1 - Produção (Com Buffers de Renderização)
   ================================================

   CORREÇÕES APLICADAS v3.0:
   [1] Fase Processual: Cada IDEIA agora expõe explicitamente
       seu contexto processual (fase/documento) como primeira linha,
       dando ao LLM a âncora narrativa para posicionar a prova
       corretamente dentro da estrutura da minuta.
   [2] Fila de Download Sequencial: O padrão frágil de setTimeout
       acumulativo foi substituído por um loop async/await encadeado,
       tornando o download de imagens determinístico e à prova de
       falha silenciosa.
   [3] Fallback de Título Instrucional: O fallback genérico
       'Análise Probatória' foi substituído por texto que instrui
       o LLM a inferir a tese, evitando que ele trate o rótulo
       como uma tese definida.
       
   CORREÇÕES APLICADAS v3.1:
   [4] Blindagem de Strings: Centralização de tratamento via helper _safeMD,
       impedindo que parágrafos inseridos pelo usuário quebrem as tags Markdown.
   [5] Recuperação de Contexto (SourceRef): Mapeamento dinâmico entre intenções 
       metodológicas e as sub-provas que as originaram.

   CORREÇÕES APLICADAS v3.1.1 (Hotfix):
   [6] Arquitetura de Buffers: Montagem Top-Down garantindo que as tags
       XML sejam lidas pela IA antes da matriz probatória, suprimindo tags vazias.
   ================================================ */

window.ExportManager = (function () {
    'use strict';

    let _deps = {};

    // ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────

    function init(dependencies) {
        _deps = dependencies;
    }

    // ─── UTILITÁRIOS PRIVADOS ─────────────────────────────────────────────────

    /**
     * Formata a citação oficial de referência cruzada com os PDFs anexos.
     * Padrão esperado pelo Mestre de Gabinete: (Id Y - fl X)
     */
    function _formatarCitacaoOficial(pjeId, pagina) {
        const strId = pjeId   ? `Id ${pjeId}`   : 'Id não idt.';
        const strFl = pagina  ? `fl ${pagina}`  : 'fl não idt.';
        return `(${strId} - ${strFl})`;
    }

    /**
     * Gera nome de arquivo de imagem com hierarquia e metadados PJe.
     * CRÍTICO: O nome gerado aqui DEVE ser idêntico ao usado no MD e no download.
     */
    function _gerarNomeArquivoImagem(ideiaNum, subNum, pjeId, pagina) {
        const strId      = pjeId   ? `_Id_${pjeId}`   : '';
        const strFl      = pagina  ? `_fl_${pagina}`  : '';
        const hierarquia = subNum  ? `${ideiaNum}.${subNum}` : `${ideiaNum}`;
        return `Recorte_Prova_${hierarquia}${strId}${strFl}.png`;
    }

    /**
     * [CORREÇÃO #2] Download seguro de imagem a partir de base64.
     * Retorna uma Promise para permitir encadeamento na fila sequencial.
     */
    async function _downloadImagemSegura(base64Data, nomeArquivoBase) {
        try {
            const response = await fetch(base64Data);
            const blob     = await response.blob();
            const url      = URL.createObjectURL(blob);
            const link     = document.createElement('a');
            link.href      = url;
            link.download  = nomeArquivoBase;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Aguarda 1 tick antes de revogar, garantindo que o browser
            // já iniciou o download antes de liberar o objeto URL.
            await new Promise(resolve => setTimeout(resolve, 50));
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(`[ExportManager] Falha ao baixar imagem "${nomeArquivoBase}":`, e);
        }
    }

    /**
     * [CORREÇÃO #2] Executa a fila de downloads de forma sequencial e segura.
     * Cada download aguarda a conclusão do anterior + pausa de 650ms.
     * Chamada sem await na função pública para não bloquear a UI.
     * @param {{ dados: string, nome: string }[]} fila
     */
    async function _executarFilaDeDownloads(fila) {
        if (!fila || fila.length === 0) return;
        _deps.exibirToast(`Iniciando download de ${fila.length} imagem(ns)...`, 'info');
        for (const item of fila) {
            await _downloadImagemSegura(item.dados, item.nome);
            // Pausa entre downloads para evitar colisão no gerenciador do browser.
            await new Promise(resolve => setTimeout(resolve, 650));
        }
        _deps.exibirToast('Todas as imagens foram baixadas.', 'sucesso');
    }

    /**
     * Remove sintaxes exclusivas de renderização da UI (ex: [[size:2]])
     * Evita vazamento de pseudo-código inútil para o LLM.
     */
    function _stripInternalTags(texto) {
        if (!texto) return '';
        return texto.replace(/\[\[\/?size(:\d)?\]\]/g, '');
    }

    /**
     * Sanitiza textos livres do usuário para injeção segura em blocos Markdown.
     * Previne que quebras de linha (\n) escapem da formatação do blockquote ou lista.
     * Aplica o pipeline completo: Strip UI -> Replace quebras de linha
     * @param {string} texto Conteúdo bruto.
     * @param {string} prefixo Prefixo estrutural (ex: '\n  > ' ou '\n  ').
     */
    function _safeMD(texto, prefixo = '\n  > ') {
        if (!texto) return '';
        const textoLimpo = _stripInternalTags(texto);
        return textoLimpo.replace(/\n/g, prefixo);
    }

    /**
     * Sanitiza atributos para injeção segura em tags XML.
     * Previne quebra de payload por aspas duplas no nome da tese.
     */
    function _escapeXmlAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Remove padrões de prompt injection de forma cirúrgica.
     * Evita bloqueio de palavras comuns no meio jurídico (ex: "ignore", "modelo").
     */
    function _sanitizarContraInjecao(texto) {
        if (!texto) return '';
        return texto
            // Intercepta comandos diretos para a IA
            .replace(/\b(IA|Modelo|GPT|LLM)\s*:/gi, '[SISTEMA]')
            // Intercepta expressões exclusivas de jailbreak/injection
            .replace(/\bignore\s+(tudo|o\s+que|as\s+instru[çc][õo]es|o\s+prompt)\b/gi, '[FILTRADO]')
            // Intercepta injeção de novas regras de sistema
            .replace(/(^|[.!?\n])\s*(nova\s+)?instru[çc][aã]o\s*:/gim, '$1 [FILTRADO]:');
    }

    /**
     * Limita trechos massivos para proteger a janela de contexto do LLM.
     * Limite ajustado para 4000 caracteres (~1.5 laudas) para evitar corte de cláusulas críticas.
     */
    function _truncarTextoParaIA(texto, limite = 4000) {
        if (!texto || texto.length <= limite) return texto;
        return texto.substring(0, limite) + 
            `\n\n[⚠️ TRECHO TRUNCADO: O assessor destacou um bloco longo. Trabalhe com a ideia central extraída da parte acima.]`;
    }

    /**
     * Achata a hierarquia da anotação (Mestre + Correlacionados) para
     * inferência de contexto processual.
     * ATUALIZAÇÃO: Radar de palavras-chave expandido para cobrir os novos atos de Execução.
     */
    function _inferirContextoProcessual(anotacoes) {
        const todosDocumentos = anotacoes.flatMap(an => {
            const docs = [an.documento || ''];
            if (an.itensCorrelacionados) {
                docs.push(...an.itensCorrelacionados.map(ic => ic.documento || ''));
            }
            return docs;
        });

        const palavrasChaveExecucao = [
            'Agravo de Petição', 'Contraminuta', 'Sentença de Execução', 
            'Embargos à Execução', 'Título Executivo', 'Cálculos', 
            'Liquidação', 'Penhora', 'Bacenjud', 'Sisbajud', 'Impugnação aos Cálculos'
        ];

        return {
            isExecucao: todosDocumentos.some(doc => palavrasChaveExecucao.some(palavra => doc.includes(palavra))),
            isAI: todosDocumentos.some(d => d.includes('Agravo de Instrumento'))
        };
    }

    // ─── GERADOR DE MARKDOWN ──────────────────────────────────────────────────

    /**
     * Constrói o payload Markdown completo ("Roteiro do Diretor") para o
     * Mestre de Gabinete. Segue estritamente a arquitetura de tags esperada
     * pelo System Prompt externo.
     */
    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const safeFormatTime = (sec) => window.AudioManager?.formatTime ? window.AudioManager.formatTime(sec) : `${Math.floor(sec/60)}' ${Math.floor(sec%60)}''`;

        const preliminaresInjetadas = [];
        const baseLegalObrigatoria = [];
        const vereditosLocaisInjetados = []; 
        const diretrizesGlobaisGerais = []; 

        if (topico.diretrizesGlobais) {
            topico.diretrizesGlobais.forEach(dir => {
                if (dir.intencao === 'fundamentacao') baseLegalObrigatoria.push(`[Diretriz Global]: ${_safeMD(dir.texto)}`);
                else if (dir.intencao === 'preliminar') preliminaresInjetadas.push(`[Diretriz Global]: ${_safeMD(dir.texto)}`);
                else if (dir.intencao === 'veredito') vereditosLocaisInjetados.push(`[Diretriz Global]: ${_safeMD(dir.texto)}`);
                else if (dir.intencao !== 'nota') { 
                    diretrizesGlobaisGerais.push(`[${(dir.intencao || 'PREMISSA GLOBAL').toUpperCase()}]: ${_safeMD(dir.texto)}`);
                }
            });
        }

        let mdCabecalho = `---\n*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*\n---\n\n`;
        mdCabecalho += `# TÓPICO RECURSAL: **${(topico.nome || 'Tópico Sem Nome').toUpperCase()}**\n\n`;

        // CORREÇÃO: BUG #1, BUG #4 e FALHA DE DESIGN (Teses condicionais e alinhamento XML)
        let mdDiretrizesTeses = '';
        let bufferTeses = '';
        
        if (topico.diretrizesPorTese) {
            for (const [nomeTese, diretrizes] of Object.entries(topico.diretrizesPorTese)) {
                if (diretrizes && diretrizes.length > 0) {
                    bufferTeses += `<tese_alvo nome="${_escapeXmlAttr(nomeTese)}">\n`;
                    diretrizes.forEach(dir => {
                        // Passando '\n  ' explicitly to avoid injecting Blockquote '>' syntax
                        bufferTeses += `- [${(dir.intencao || 'DIRETRIZ').toUpperCase()}]: ${_safeMD(dir.texto, '\n  ')}\n`;
                    });
                    bufferTeses += `</tese_alvo>\n\n`;
                }
            }
        }
        
        if (bufferTeses.trim() !== '') {
            mdDiretrizesTeses = `<direcionamentos_por_tese>\n*Atenção IA: Regras estritas aplicáveis EXCLUSIVAMENTE ao momento em que redigir a tese correspondente.*\n\n${bufferTeses}</direcionamentos_por_tese>\n\n`;
        }

        let mdMatriz = `## MATRIZ DIALÉTICA E MAPEAMENTO PROBATÓRIO\n*Atenção IA: Esta é a sua fonte de premissas fáticas incontroversas (Premissa Menor). Nunca presuma fatos fora destes blocos.*\n\n`;

        topico.anotacoes.forEach((an, index) => {
            const numIdeia    = index + 1;
            const refCitacao  = _formatarCitacaoOficial(an.pjeId, an.pagina);
            const tituloIdeia = an.tese ? an.tese : 'Tese não nomeada pelo assessor';

            mdMatriz += `<analise_da_prova id="${numIdeia}" tese="${_escapeXmlAttr(tituloIdeia)}">\n`;

            const faseContexto  = an.fase      || an.documento || 'Não especificado';
            const poloContexto  = an.polo      || 'N/A';
            mdMatriz += `<contexto_processual>Fase: ${faseContexto} | Polo: ${poloContexto} | Referência: ${refCitacao}</contexto_processual>\n\n`;

            mdMatriz += `<fato_bruto_inconteste role="foco_de_atencao">\n`;
            mdMatriz += `> ⚠️ INSTRUÇÃO DE LEITURA: Capte a IDEIA CENTRAL deste elemento e articule-a com fluidez. PROIBIDO cópia literal, exceto se houver comando explícito em contrário.\n\n`;

            const docLabel = `**[${an.documento || 'Elemento'}] (${an.polo || 'Sem polo'}) ${refCitacao}:**`;

            if (an.tipo === 'texto') {
                const conteudoSeguro = _sanitizarContraInjecao(an.conteudo);
                const conteudoProcessado = _truncarTextoParaIA(conteudoSeguro);
                mdMatriz += `- ${docLabel} ${conteudoProcessado.replace(/\n/g, ' ')}\n`;
            } else if (an.tipo === 'imagem') {
                const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                mdMatriz += `- ${docLabel}\n  > 🖼️ **[IMAGEM FORNECIDA]** (Nome: \`${imgNome}\`).\n  > 🧠 *Comentário Humano:* ${_safeMD(an.comentario || 'Integrar à fundamentação.', '\n  > ')}\n`;
            } else if (an.tipo === 'audio') {
                try {
                    const ad = JSON.parse(an.conteudo);
                    const oradorFinal = ad.role || ad.oradorStr || 'Orador não idt.';
                    mdMatriz += `- ${docLabel} 🎙️ **[OITIVA DE AUDIÊNCIA]** (${oradorFinal} — ${safeFormatTime(ad.inicio)} a ${safeFormatTime(ad.fim)}).\n`;
                    if (an.comentario) mdMatriz += `  > 🧠 *Observação:* ${_safeMD(an.comentario, '\n  > ')}\n`;
                    if (ad.transcricao) mdMatriz += `  > 📜 *Degravação Literal:* "${_safeMD(ad.transcricao, '\n  > ')}"\n`;
                } catch (e) {
                    mdMatriz += `- ${docLabel} 🎙️ **[ÁUDIO]** *Resumo:* ${_safeMD(an.comentario || 'Sem comentário.', '\n  > ')}\n`;
                }
            }

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr, corrIdx) => {
                    const numSub     = corrIdx + 1;
                    const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                    const cDocLabel   = `  ↳ *Confronto [${corr.documento || 'Doc'}] (${corr.polo || 'Polo'}) ${cRefCitacao}:*`;

                    if (corr.tipo === 'texto') {
                        const corrConteudoSeguro = _sanitizarContraInjecao(corr.comentario ? corr.comentario : (corr.conteudo || ''));
                        const corrConteudoProcessado = _truncarTextoParaIA(corrConteudoSeguro);
                        mdMatriz += `${cDocLabel} ${_safeMD(corrConteudoProcessado, ' ')}\n`;
                    } else if (corr.tipo === 'imagem') {
                        mdMatriz += `${cDocLabel}\n    > 🖼️ **[IMAGEM ANEXA: \`${_gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina)}\`]**\n    > 🧠 *Comentário:* ${_safeMD(corr.comentario || 'Analise a ligação técnica.', '\n    > ')}\n`;
                    } else if (corr.tipo === 'audio') {
                        try {
                            const ad = JSON.parse(corr.conteudo);
                            const oradorFinal = ad.role || ad.oradorStr || 'Orador não idt.';
                            mdMatriz += `${cDocLabel} 🎙️ **[OITIVA]** (${oradorFinal} — ${safeFormatTime(ad.inicio)} a ${safeFormatTime(ad.fim)}).\n`;
                            if (corr.comentario) mdMatriz += `    > 🧠 *Observação:* ${_safeMD(corr.comentario, '\n    > ')}\n`;
                            if (ad.transcricao) mdMatriz += `    > 📜 *Degravação:* "${_safeMD(ad.transcricao, '\n    > ')}"\n`;
                        } catch (e) {
                            mdMatriz += `${cDocLabel} 🎙️ **[ÁUDIO]** *Contexto:* ${_safeMD(corr.comentario || 'Ausente.', '\n    > ')}\n`;
                        }
                    }
                });
            }

            mdMatriz += `</fato_bruto_inconteste>\n\n`;

            // CORREÇÃO: BUG #2 e BUG #3. Consolidação de nós locais em buffer.
            let localNodesBuffer = '';

            const processarNos = (listaNos, refContexto) => {
                if (!listaNos || listaNos.length === 0) return;
                
                listaNos.forEach((sub) => {
                    const intencao = sub.intencao || 'fallback';
                    const textoSanitizado = _safeMD(sub.texto, '\n  ');

                    // Escopo Local: vai para o buffer da prova
                    if (intencao === 'premissa') {
                        localNodesBuffer += `[PREMISSA LÓGICA INQUESTIONÁVEL${refContexto}]: ${textoSanitizado}\n`;
                    } else if (intencao === 'refutacao') {
                        localNodesBuffer += `[AFASTAMENTO DE TESE OBRIGATÓRIO${refContexto}]: ${textoSanitizado}\n`;
                    } else if (intencao === 'comando') {
                        localNodesBuffer += `[COMANDO DE EXECUÇÃO ESTRITA${refContexto}]: ${textoSanitizado}\n`;
                    } else if (intencao === 'texto') {
                        localNodesBuffer += `[COPIAR E COLAR EXATAMENTE ESTE TEXTO${refContexto}]: "${textoSanitizado}"\n`;
                    } else if (intencao === 'fallback') {
                        localNodesBuffer += `[CONTEXTO FÁTICO COMPLEMENTAR${refContexto}]: ${textoSanitizado}\n`;
                    } 
                    // Escopo Global: Bubble-up
                    else if (intencao === 'fundamentacao') {
                        baseLegalObrigatoria.push(`[Referência da Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    } else if (intencao === 'preliminar') {
                        preliminaresInjetadas.push(`[Referência da Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    } else if (intencao === 'veredito') {
                        vereditosLocaisInjetados.push(`[Baseado na Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    }
                });
            };

            processarNos(an.subAnotacoes, '');

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr) => {
                    if (corr.subAnotacoes && corr.subAnotacoes.length > 0) {
                        let docNome = corr.documento || corr.tipo;
                        const focoContexto = ` [Foco na Prova: ${docNome} ${corr.pagina ? 'fl.' + corr.pagina : ''}]`;
                        processarNos(corr.subAnotacoes, focoContexto);
                    }
                });
            }

            // Emissão segura da Tag Local
            if (localNodesBuffer.trim() !== '') {
                mdMatriz += `<diretrizes_vinculantes_do_assessor>\n${localNodesBuffer}</diretrizes_vinculantes_do_assessor>\n`;
            }

            mdMatriz += `</analise_da_prova>\n\n`; 
        });

        let mdTags = '';
        const contexto = _inferirContextoProcessual(topico.anotacoes);

        // CORREÇÃO: LACUNA ARQUITETURAL (Adição de Fallback de Fase de Conhecimento)
        if (contexto.isExecucao) {
            mdTags += `<diretriz_cognitiva_ia>\n*ALERTA:* O conjunto probatório deste tópico refere-se à **FASE DE EXECUÇÃO** (ex: Agravo de Petição). Seu raciocínio jurídico DEVE ser restrito aos limites da coisa julgada, cálculos de liquidação e preclusão. Atos de "Juízo / Tribunal" ou "Auxiliar da Justiça" representam atos oficiais e possuem presunção de veracidade.\n</diretriz_cognitiva_ia>\n\n`;
        } else if (contexto.isAI) {
            mdTags += `<diretriz_cognitiva_ia>\n*ALERTA:* O foco deste tópico é um **Agravo de Instrumento**. Sua redação deve focar primariamente em destrancar ou manter o trancamento do recurso principal, avaliando estritamente pressupostos de admissibilidade.\n</diretriz_cognitiva_ia>\n\n`;
        } else {
            mdTags += `<diretriz_cognitiva_ia>\n*ALERTA DE SISTEMA:* O foco deste tópico é a **Fase de Conhecimento** (ex: Recurso Ordinário). Analise o mérito da controvérsia, contrastando os fatos extraídos, os pedidos formulados e a sentença originária.\n</diretriz_cognitiva_ia>\n\n`;
        }

        if (preliminaresInjetadas.length > 0) {
            mdTags += `<questoes_preliminares_e_prejudiciais>\n`;
            mdTags += `*Atenção IA: Você DEVE redigir e resolver estas questões temporais/processuais ANTES de iniciar a análise de mérito da Matriz Dialética.*\n`;
            mdTags += preliminaresInjetadas.map(c => `* ⏳ ${c}`).join('\n') + '\n';
            mdTags += `</questoes_preliminares_e_prejudiciais>\n\n`;
        }

        if (topico.alegacoes || topico.fundamentos) {
            mdTags += `<relatorio_do_conflito>\n`;
            mdTags += `*Atenção IA: Utilize estas teses para redigir a introdução do tópico recursal, contrapondo o que foi decidido na origem com o que a parte recorrente busca.*\n\n`;
            if (topico.alegacoes) {
                mdTags += `**Teses Recursais (O que a parte pede):**\n${_safeMD(topico.alegacoes, '\n')}\n\n`;
            }
            if (topico.fundamentos) {
                mdTags += `**Fundamentos da Origem (Por que o juiz decidiu assim):**\n${_safeMD(topico.fundamentos, '\n')}\n\n`;
            }
            mdTags += `</relatorio_do_conflito>\n\n`;
        }

        if (baseLegalObrigatoria.length > 0) {
            mdTags += `<base_legal_obrigatoria>\n`;
            mdTags += baseLegalObrigatoria.map(c => `* ${c}`).join('\n') + '\n';
            mdTags += `</base_legal_obrigatoria>\n\n`;
        }

        let mdVeredito = '';
        if ((topico.veredito && topico.veredito.trim() !== '') || vereditosLocaisInjetados.length > 0) {
            mdVeredito += `<decisao_magistrado_pretendida>\n`;
            mdVeredito += `*Atenção IA: As instruções abaixo ditam o resultado final do recurso. Siga-as para redigir o dispositivo.*\n`;
            
            if (topico.veredito) mdVeredito += `* CONTEXTO GERAL: ${topico.veredito.replace(/\n/g, ' ')}\n`;
            
            vereditosLocaisInjetados.forEach(v => {
                mdVeredito += `* CONCLUSÃO PARCIAL: ${v}\n`;
            });
            
            mdVeredito += `</decisao_magistrado_pretendida>\n`;
        }

        let mdDiretrizesGlobais = '';
        if (diretrizesGlobaisGerais.length > 0) {
            mdDiretrizesGlobais += `<diretrizes_globais_do_topico>\n`;
            mdDiretrizesGlobais += `*Atenção IA: Regras aplicáveis a TODO o recurso. Obedeça a elas independentemente da tese atual.*\n\n`;
            diretrizesGlobaisGerais.forEach(dir => {
                mdDiretrizesGlobais += `- ${dir}\n`;
            });
            mdDiretrizesGlobais += `</diretrizes_globais_do_topico>\n\n`;
        }

        return mdCabecalho + mdTags + mdVeredito + mdDiretrizesGlobais + mdDiretrizesTeses + mdMatriz;
    }

    // ─── DOWNLOAD DE ARQUIVO MARKDOWN ─────────────────────────────────────────

    function _downloadArquivo(nomeArquivo, conteudo) {
        const blob = new Blob([conteudo], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        const url  = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', nomeArquivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // ─── FUNÇÃO PÚBLICA PRINCIPAL ─────────────────────────────────────────────

    /**
     * Exporta o tópico ativo como pacote completo:
     *   1. Markdown estruturado (.md) — o "Roteiro do Diretor"
     *   2. Imagens referenciadas (.png) — baixadas em fila sequencial segura
     */
    function exportarTopicoAtivo() {
        const activeId = _deps.getActiveTabId();
        if (!activeId) {
            _deps.exibirToast('Selecione um tópico antes de exportar.', 'aviso');
            return;
        }

        const topico = _deps.getTopicos().find(t => t.id === activeId);
        if (!topico || topico.anotacoes.length === 0) {
            _deps.exibirToast('O tópico está vazio ou é inválido.', 'aviso');
            return;
        }

        // GUARDRAIL TAREFAS PENDENTES
        if (window.BalancaManager && window.BalancaManager.getPendingTasks() > 0) {
            const count = window.BalancaManager.getPendingTasks();
            const msg = `ATENÇÃO: Existem ${count} tarefa(s) pendente(s) não concluídas no Painel da Balança.\n\nTem certeza de que deseja gerar o pacote de exportação para a IA mesmo assim?`;
            
            // O confirm nativo interrompe o thread e impede a exportação sem complicação
            if (!confirm(msg)) {
                _deps.exibirToast('Exportação interrompida pelo usuário.', 'aviso');
                return;
            }
        }

        try {
            // ── Passo 1: Gerar e baixar o Markdown ──────────────────────────
            const markdownConteudo = _gerarMarkdown(topico);
            
            // Tratamento extra seguro para garantir que a propriedade nome exista
            const nomeBase = topico.nome || 'Exportacao_JurisNotes';
            
            const nomeSanitizado = nomeBase
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase();

            _downloadArquivo(`Pacote_JurisNotes_${nomeSanitizado}.md`, markdownConteudo);
            _deps.exibirToast('Pacote Markdown exportado! Preparando imagens...', 'sucesso');

            // ── Passo 2: Montar e executar a fila de imagens ──
            const filaDeDownloads = [];

            topico.anotacoes.forEach((an, index) => {
                const numIdeia = index + 1;

                if (an.tipo === 'imagem') {
                    filaDeDownloads.push({
                        dados: an.conteudo,
                        nome:  _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina),
                    });
                }

                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        if (corr.tipo === 'imagem') {
                            filaDeDownloads.push({
                                dados: corr.conteudo,
                                nome:  _gerarNomeArquivoImagem(numIdeia, corrIdx + 1, corr.pjeId, corr.pagina),
                            });
                        }
                    });
                }
            });

            _executarFilaDeDownloads(filaDeDownloads);

        } catch (error) {
            console.error('[ExportManager] Erro ao gerar exportação:', error);
            _deps.exibirToast('Erro ao gerar exportação. Verifique o console.', 'erro');
        }
    }

    // ─── API PÚBLICA ──────────────────────────────────────────────────────────

    /**
     * Retorna os dados do tópico ativo de forma segura para consumo da UI.
     * Atua como Single Source of Truth, mantendo a regra de negócio blindada.
     * @returns {{ nome: string, markdown: string } | null}
     */
    function obterDadosDoTopicoAtivo() {
        const activeId = _deps.getActiveTabId();
        if (!activeId) return null;

        const topicos = _deps.getTopicos();
        if (!topicos || !Array.isArray(topicos)) return null;

        const topico = topicos.find(t => t.id === activeId);
        if (!topico || topico.anotacoes.length === 0) return null;

        return {
            nome: topico.nome || 'Tópico Sem Nome',
            markdown: _gerarMarkdown(topico)
        };
    }

    return { init, exportarTopicoAtivo, obterDadosDoTopicoAtivo };

})();
