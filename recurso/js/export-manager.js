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
     * Sanitiza textos livres do usuário para injeção segura em blocos Markdown.
     * Previne que quebras de linha (\n) escapem da formatação do blockquote ou lista.
     * @param {string} texto Conteúdo bruto.
     * @param {string} prefixo Prefixo estrutural (ex: '\n  > ' ou '\n  ').
     */
    function _safeMD(texto, prefixo = '\n  > ') {
        if (!texto) return '';
        return texto.replace(/\n/g, prefixo);
    }

    /**
     * Achata a hierarquia da anotação (Mestre + Correlacionados) para
     * inferência de contexto processual.
     */
    function _inferirContextoProcessual(anotacoes) {
        const todosDocumentos = anotacoes.flatMap(an => {
            const docs = [an.documento || ''];
            if (an.itensCorrelacionados) {
                docs.push(...an.itensCorrelacionados.map(ic => ic.documento || ''));
            }
            return docs;
        });

        return {
            isExecucao: todosDocumentos.some(d => d.includes('Agravo de Petição') || d.includes('Sentença de Execução') || d.includes('Embargos à Execução') || d.includes('Atos de Execução') || d.includes('Contraminuta')),
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

        // Coletores para os blocos globais de arquitetura
        const preliminaresInjetadas = [];
        const comandosInjetados    = [];
        const baseLegalObrigatoria = [];

        // BUFFER 1: Cabeçalho
        // Fallback defensivo para topico.nome nulo/undefined
        let mdCabecalho = `---\n*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*\n---\n\n`;
        mdCabecalho += `# TÓPICO RECURSAL: **${(topico.nome || 'Tópico Sem Nome').toUpperCase()}**\n\n`;

        // BUFFER 2: Matriz Dialética (Processamento O(n))
        let mdMatriz = `## MATRIZ DIALÉTICA E MAPEAMENTO PROBATÓRIO\n*Atenção IA: Esta é a sua fonte de premissas fáticas inconstroversas (Premissa Menor). Integre as âncoras (Id - fl) buscando nos PDFs anexos os detalhes de contexto de cada folha citada. Nunca presuma fatos fora destes blocos.*\n\n`;

        // Iteração Cronológica mantida intacta (Preservação de Closures)
        topico.anotacoes.forEach((an, index) => {
            const numIdeia    = index + 1;
            const refCitacao  = _formatarCitacaoOficial(an.pjeId, an.pagina);
            const tituloIdeia = an.tese ? an.tese : '[Tese não nomeada pelo assessor — inferir do conteúdo probatório abaixo]';

            mdMatriz += `### 📌 IDEIA ${numIdeia}: ${tituloIdeia}\n\n`;

            const faseContexto  = an.fase      || an.documento || 'Não especificado';
            const poloContexto  = an.polo      || 'N/A';
            mdMatriz += `> 📂 *Contexto Processual:* **${faseContexto}** | Polo: **${poloContexto}** | Referência: **${refCitacao}**\n\n`;

            const docLabel = `**[${an.documento || 'Elemento'}] (${an.polo || 'Sem polo'}) ${refCitacao}:**`;

            if (an.tipo === 'texto') {
                mdMatriz += `- ${docLabel} ${an.conteudo.replace(/\n/g, ' ')}\n`;
            } else if (an.tipo === 'imagem') {
                const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                mdMatriz += `- ${docLabel}\n`;
                mdMatriz += `  > 🖼️ **[IMAGEM FORNECIDA PELO ASSESSOR]** (Nome do arquivo: \`${imgNome}\`).\n`;
                mdMatriz += `  > 🧠 *Comentário Humano:* ${_safeMD(an.comentario || 'Extraia a informação desta imagem e integre à fundamentação.', '\n  > ')}\n`;
            } else if (an.tipo === 'audio') {
                try {
                    const ad = JSON.parse(an.conteudo);
                    const oradorFinal = ad.role || ad.oradorStr || 'Orador não idt.';
                    mdMatriz += `- ${docLabel} 🎙️ **[OITIVA DE AUDIÊNCIA]** (${oradorFinal} — ${safeFormatTime(ad.inicio)} a ${safeFormatTime(ad.fim)}).\n`;
                    
                    if (an.comentario) mdMatriz += `  > 🧠 *Observação / Contexto do Assessor:* ${_safeMD(an.comentario, '\n  > ')}\n`;
                    if (ad.transcricao) mdMatriz += `  > 📜 *Degravação Literal:* "${_safeMD(ad.transcricao, '\n  > ')}"\n`;
                    if (!an.comentario && !ad.transcricao) mdMatriz += `  > 🧠 *Sem transcrição ou observações registradas.*\n`;
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
                        const txt = corr.comentario ? corr.comentario : (corr.conteudo || '');
                        mdMatriz += `${cDocLabel} ${_safeMD(txt, ' ')}\n`;
                    } else if (corr.tipo === 'imagem') {
                        const imgNomeSub = _gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina);
                        mdMatriz += `${cDocLabel}\n`;
                        mdMatriz += `    > 🖼️ **[IMAGEM ANEXA: \`${imgNomeSub}\`]**\n`;
                        mdMatriz += `    > 🧠 *Comentário:* ${_safeMD(corr.comentario || 'Analise a ligação técnica.', '\n    > ')}\n`;
                    } else if (corr.tipo === 'audio') {
                        try {
                            const ad = JSON.parse(corr.conteudo);
                            const oradorFinal = ad.role || ad.oradorStr || 'Orador não idt.';
                            mdMatriz += `${cDocLabel} 🎙️ **[OITIVA DE AUDIÊNCIA]** (${oradorFinal} — ${safeFormatTime(ad.inicio)} a ${safeFormatTime(ad.fim)}).\n`;
                            
                            if (corr.comentario) mdMatriz += `    > 🧠 *Observação / Contexto:* ${_safeMD(corr.comentario, '\n    > ')}\n`;
                            if (ad.transcricao) mdMatriz += `    > 📜 *Degravação Literal:* "${_safeMD(ad.transcricao, '\n    > ')}"\n`;
                            if (!corr.comentario && !ad.transcricao) mdMatriz += `    > 🧠 *Sem observações registradas.*\n`;
                        } catch (e) {
                            mdMatriz += `${cDocLabel} 🎙️ **[ÁUDIO]** *Contexto:* ${_safeMD(corr.comentario || 'Informativo ausente.', '\n    > ')}\n`;
                        }
                    }
                });
            }

            // Closure preservada: Manipulação segura dos arrays via referência local
            const imprimirNos = (listaNos, refContexto) => {
                if (!listaNos || listaNos.length === 0) return;
                
                listaNos.forEach((sub) => {
                    const intencao = sub.intencao || 'premissa';
                    const textoSanitizado = _safeMD(sub.texto, '\n  ');

                    if (intencao === 'premissa') {
                        mdMatriz += `\n  💡 **Premissa Lógica do Assessor (Incontroversa)${refContexto}:** ${textoSanitizado}\n`;
                    } else if (intencao === 'refutacao') {
                        mdMatriz += `\n  🛡️ **Refutação de Mérito / Afastamento de Tese${refContexto}:** ${textoSanitizado}\n`;
                    } else if (intencao === 'comando') {
                        comandosInjetados.push(`[Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    } else if (intencao === 'texto') {
                        comandosInjetados.push(`[Ideia ${numIdeia}${refContexto} — TEXTO FIXO]: Incorpore: "${textoSanitizado}"`);
                    } else if (intencao === 'fundamentacao') {
                        baseLegalObrigatoria.push(`[Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    } else if (intencao === 'preliminar') {
                        preliminaresInjetadas.push(`[Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                    }
                });
            };

            imprimirNos(an.subAnotacoes, '');

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr) => {
                    if (corr.subAnotacoes && corr.subAnotacoes.length > 0) {
                        let docNome = corr.documento || corr.tipo;
                        if (corr.tipo === 'audio') docNome = 'Oitiva/Áudio';
                        const focoContexto = ` [Foco na Prova Secundária: ${docNome} ${corr.pagina ? 'fl.' + corr.pagina : ''}]`;
                        imprimirNos(corr.subAnotacoes, focoContexto);
                    }
                });
            }

            mdMatriz += `\n---\n\n`; 
        });

        // BUFFER 3: Montagem das Tags XML Estruturais (Condicionais sem fallbacks vazios)
        let mdTags = '';

        // --- INJEÇÃO DA DIRETRIZ COGNITIVA (Top-Down Context) ---
        const contexto = _inferirContextoProcessual(topico.anotacoes);

        if (contexto.isExecucao) {
            mdTags += `<diretriz_cognitiva_ia>\n`;
            mdTags += `*ALERTA DE SISTEMA:* O conjunto probatório deste tópico refere-se à **FASE DE EXECUÇÃO** (ex: Agravo de Petição). Seu raciocínio jurídico DEVE ser restrito aos limites da coisa julgada, cálculos de liquidação e preclusão. É terminantemente proibido reavaliar mérito da fase de conhecimento ou presumir fatos fora do estrito limite da execução.\n`;
            mdTags += `</diretriz_cognitiva_ia>\n\n`;
        } else if (contexto.isAI) {
            mdTags += `<diretriz_cognitiva_ia>\n`;
            mdTags += `*ALERTA DE SISTEMA:* O foco deste tópico é um **Agravo de Instrumento**. Sua redação deve focar primariamente em destrancar ou manter o trancamento do recurso principal, avaliando estritamente pressupostos de admissibilidade (tempestividade, preparo, deserção, transcendência).\n`;
            mdTags += `</diretriz_cognitiva_ia>\n\n`;
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

        if (comandosInjetados.length > 0) {
            mdTags += `<comandos_para_a_minuta>\n`;
            mdTags += comandosInjetados.map(c => `* ${c}`).join('\n') + '\n';
            mdTags += `</comandos_para_a_minuta>\n\n`;
        }

        if (baseLegalObrigatoria.length > 0) {
            mdTags += `<base_legal_obrigatoria>\n`;
            mdTags += baseLegalObrigatoria.map(c => `* ${c}`).join('\n') + '\n';
            mdTags += `</base_legal_obrigatoria>\n\n`;
        }

        // A Tag de Decisão SEMPRE deve ficar no final da concatenação para âncora de recência da IA.
        let mdVeredito = '';
        if (topico.veredito && topico.veredito.trim() !== '') {
            mdVeredito += `<decisao_magistrado_pretendida>\n`;
            mdVeredito += `* ${topico.veredito.replace(/\n/g, ' ')}\n`;
            mdVeredito += `\n*Sintetize esta decisão em um dispositivo claro ao final da minuta.*\n`;
            mdVeredito += `</decisao_magistrado_pretendida>\n`;
        }

        // MONTAGEM FINAL DA STRING: Regras da IA primeiro (mdTags), Fatos depois (mdMatriz), Dispositivo no fim (mdVeredito).
        return mdCabecalho + mdTags + mdMatriz + mdVeredito;
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

    return { init, exportarTopicoAtivo };

})();
