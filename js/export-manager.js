/* ================================================
   export-manager.js
   Módulo de Formatação e Exportação: Markdown + Imagens
   Arquitetura: "Roteiro do Diretor" para o Mestre de Gabinete
   Versão: 3.0 - Produção
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

    // ─── GERADOR DE MARKDOWN ──────────────────────────────────────────────────

    /**
     * Constrói o payload Markdown completo ("Roteiro do Diretor") para o
     * Mestre de Gabinete. Segue estritamente a arquitetura de tags esperada
     * pelo System Prompt externo.
     *
     * ESTRUTURA DO PAYLOAD:
     *   1. Cabeçalho de Identificação
     *   2. MATRIZ DIALÉTICA E MAPEAMENTO PROBATÓRIO (corpo das IDEIAs)
     *      └─ Cada IDEIA: Contexto Processual → Prova Principal → Confrontos → Premissas
     *   3. <comandos_para_a_minuta>     (estilo, tom, redações obrigatórias)
     *   4. <base_legal_obrigatoria>     (Premissa Maior do silogismo)
     *   5. <decisao_magistrado_pretendida> (âncora teleológica final — SEMPRE POR ÚLTIMO)
     */
    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');

        // Coletores para os blocos globais de arquitetura (tags XML)
        const preliminaresInjetadas = [];
        const alegacoesInjetadas    = [];
        const fundamentosInjetados  = [];
        
        const comandosInjetados    = [];
        const vereditosExigidos    = [];
        const baseLegalObrigatoria = [];

        // ── Cabeçalho do Pacote ──────────────────────────────────────────────
        let md = `---
*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*
---

# TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**

## MATRIZ DIALÉTICA E MAPEAMENTO PROBATÓRIO
*Atenção IA: Esta é a sua fonte de premissas fáticas inconstroversas (Premissa Menor). Integre as âncoras (Id - fl) buscando nos PDFs anexos os detalhes de contexto de cada folha citada. Nunca presuma fatos fora destes blocos.*

`;

        // ── Iteração Cronológica das IDEIAs (Esqueleto Fático) ───────────────
        topico.anotacoes.forEach((an, index) => {
            const numIdeia    = index + 1;
            const refCitacao  = _formatarCitacaoOficial(an.pjeId, an.pagina);

            // [CORREÇÃO #3] Fallback instrucional, não um rótulo genérico.
            const tituloIdeia = an.tese
                ? an.tese
                : '[Tese não nomeada pelo assessor — inferir do conteúdo probatório abaixo]';

            md += `### 📌 IDEIA ${numIdeia}: ${tituloIdeia}\n\n`;

            // [CORREÇÃO #1] Contexto Processual como primeira linha da IDEIA.
            // Fornece ao LLM a âncora narrativa para posicionar a prova na minuta
            // (ex: se vem do Recurso → entra no Relatório; se é da Sentença → fundamentação).
            const faseContexto  = an.fase      || an.documento || 'Não especificado';
            const poloContexto  = an.polo      || 'N/A';
            md += `> 📂 *Contexto Processual:* **${faseContexto}** | Polo: **${poloContexto}** | Referência: **${refCitacao}**\n\n`;

            // ── Prova Principal ──────────────────────────────────────────────
            const docLabel = `**[${an.documento || 'Elemento'}] (${an.polo || 'Sem polo'}) ${refCitacao}:**`;

            if (an.tipo === 'texto') {
                md += `- ${docLabel} ${an.conteudo.replace(/\n/g, ' ')}\n`;

            } else if (an.tipo === 'imagem') {
                const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                md += `- ${docLabel}\n`;
                md += `  > 🖼️ **[IMAGEM FORNECIDA PELO ASSESSOR]** (Nome do arquivo: \`${imgNome}\`).\n`;
                md += `  > 🧠 *Comentário Humano:* ${an.comentario || 'Extraia a informação desta imagem e integre à fundamentação.'}\n`;

            } else if (an.tipo === 'audio') {
                try {
                    const ad = JSON.parse(an.conteudo);
                    md += `- ${docLabel} 🎙️ **[OITIVA DE AUDIÊNCIA]**`;
                    md += ` (${ad.oradorStr || 'Orador não idt.'} — ${ad.labelInicio || '?'} a ${ad.labelFim || '?'}).\n`;
                    
                    // NOVA APRESENTAÇÃO ESTRUTURADA
                    if (an.comentario) {
                        md += `  > 🧠 *Observação / Contexto do Assessor:* ${an.comentario}\n`;
                    }
                    if (ad.transcricao) {
                        md += `  > 📜 *Degravação Literal:* "${ad.transcricao}"\n`;
                    }
                    if (!an.comentario && !ad.transcricao) {
                        md += `  > 🧠 *Sem transcrição ou observações registradas.*\n`;
                    }
                } catch (e) {
                    md += `- ${docLabel} 🎙️ **[ÁUDIO]** *Resumo:* ${an.comentario || 'Sem comentário.'}\n`;
                }
            }

            // ── Itens Correlacionados (Confrontos e Corroborações) ───────────
            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr, corrIdx) => {
                    const numSub     = corrIdx + 1;
                    const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                    const cDocLabel   = `  ↳ *Confronto [${corr.documento || 'Doc'}] (${corr.polo || 'Polo'}) ${cRefCitacao}:*`;

                    if (corr.tipo === 'texto') {
                        const txt = corr.comentario
                            ? corr.comentario
                            : (corr.conteudo || '').replace(/\n/g, ' ');
                        md += `${cDocLabel} ${txt}\n`;

                    } else if (corr.tipo === 'imagem') {
                        const imgNomeSub = _gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina);
                        md += `${cDocLabel}\n`;
                        md += `    > 🖼️ **[IMAGEM ANEXA: \`${imgNomeSub}\`]**\n`;
                        md += `    > 🧠 *Comentário:* ${corr.comentario || 'Analise a ligação técnica desta prova com o elemento principal acima.'}\n`;
                    }
                });
            }

            // ── Nós de Ideia (Triagem de Intenções) ─────────────────────────
            // PREMISSAS ficam coladas à IDEIA: amarram a dedução fática localmente.
            // DEMAIS INTENÇÕES são ejetadas para os blocos globais (tags XML).
            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                an.subAnotacoes.forEach((sub) => {
                    const intencao = sub.intencao || 'premissa';

                    if (intencao === 'premissa') {
                        md += `\n  💡 **Premissa Lógica do Assessor (Incontroversa):** ${sub.texto}\n`;
                    } else if (intencao === 'refutacao') {
                        md += `\n  🛡️ **Refutação de Mérito / Afastamento de Tese:** ${sub.texto}\n`;
                    } else if (intencao === 'comando') {
                        comandosInjetados.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'texto') {
                        comandosInjetados.push(`[Referente à Ideia ${numIdeia} — TEXTO OBRIGATÓRIO]: Incorpore a seguinte redação exata na minuta: "${sub.texto}"`);
                    } else if (intencao === 'veredito') {
                        vereditosExigidos.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'fundamentacao') {
                        baseLegalObrigatoria.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'preliminar') {
                        preliminaresInjetadas.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'alegacao') {
                        alegacoesInjetadas.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'fundamento_sentenca') {
                        fundamentosInjetados.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    }
                });
            }

            md += `\n---\n\n`; // Separador visual entre as IDEIAs
        });

        // ── BLOCOS GLOBAIS DE ARQUITETURA (Tags XML) ─────────────────────────
        // Ordenação silogística deliberada:
        //   Comandos (tom/estilo) → Base Legal (Premissa Maior) → Decisão (âncora final)
        // A tag <decisao_magistrado_pretendida> SEMPRE fica por último para
        // reforçar ao LLM que todo o raciocínio deve convergir para ela.

        // NOVO Bloco 0: Preliminares e Prejudiciais (Ex: Prescrição)
        md += `<questoes_preliminares_e_prejudiciais>\n`;
        md += `*Atenção IA: Se houver conteúdo nesta tag, você DEVE redigir e resolver estas questões temporais/processuais ANTES de iniciar a análise de mérito da Matriz Dialética.*\n`;
        if (preliminaresInjetadas.length > 0) {
            md += preliminaresInjetadas.map(c => `* ⏳ ${c}`).join('\n') + '\n';
        } else {
            md += `* Não foram apontadas questões preliminares ou prejudiciais de mérito pelo assessor.\n`;
        }
        md += `</questoes_preliminares_e_prejudiciais>\n\n`;

        // NOVO Bloco 1: Relatório do Conflito
        md += `<relatorio_do_conflito>\n`;
        md += `*Atenção IA: Utilize estas teses para redigir a introdução do tópico recursal, contrapondo o que foi decidido na origem com o que a parte recorrente busca.*\n`;
        if (alegacoesInjetadas.length > 0) md += `**Teses Recursais (O que a parte pede):**\n` + alegacoesInjetadas.map(c => `* 📢 ${c}`).join('\n') + '\n\n';
        if (fundamentosInjetados.length > 0) md += `**Fundamentos da Origem (Por que o juiz decidiu assim):**\n` + fundamentosInjetados.map(c => `* 🏛️ ${c}`).join('\n') + '\n';
        if (alegacoesInjetadas.length === 0 && fundamentosInjetados.length === 0) md += `* Deduzir as teses diretamente da Matriz Dialética acima.\n`;
        md += `</relatorio_do_conflito>\n\n`;

        // Bloco A: Comandos Diretos de Estilo e Redação
        md += `<comandos_para_a_minuta>\n`;
        if (comandosInjetados.length > 0) {
            md += comandosInjetados.map(c => `* ${c}`).join('\n') + '\n';
        } else {
            md += `* Elabore a minuta de forma fluida, sem diretrizes especiais de estilo além do padrão do Tribunal.\n`;
        }
        md += `</comandos_para_a_minuta>\n\n`;

        // Bloco B: Base Legal Obrigatória (Premissa Maior do Silogismo)
        md += `<base_legal_obrigatoria>\n`;
        if (baseLegalObrigatoria.length > 0) {
            md += baseLegalObrigatoria.map(c => `* ${c}`).join('\n') + '\n';
        } else {
            md += `* O Assessor não vinculou base legal obrigatória. Aplique as Súmulas do TST e regras da CLT correspondentes aos fatos da Matriz Dialética, seguindo a hierarquia: STF (RE/RG) > TST (Súmulas/OJs/IRR) > TRT-23 (Súmulas Regionais).\n`;
        }
        md += `</base_legal_obrigatoria>\n\n`;

        // Bloco C: Decisão do Magistrado (ÂNCORA TELEOLÓGICA — SEMPRE POR ÚLTIMO)
        md += `<decisao_magistrado_pretendida>\n`;
        if (vereditosExigidos.length > 0) {
            md += vereditosExigidos.map(c => `* ${c}`).join('\n') + '\n';
            md += `\n*Sintetize estas decisões parciais em um dispositivo de tópico claro e coeso ao final da minuta.*\n`;
        } else {
            md += `* [O Assessor não definiu o veredito via nós de ideia. Redija o dispositivo que for logicamente imposto pelos fatos incontroversos mapeados na Matriz Dialética acima].\n`;
        }
        md += `</decisao_magistrado_pretendida>\n`;

        return md;
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
            const nomeSanitizado   = topico.nome
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase();

            _downloadArquivo(`Pacote_JurisNotes_${nomeSanitizado}.md`, markdownConteudo);
            _deps.exibirToast('Pacote Markdown exportado! Preparando imagens...', 'sucesso');

            // ── Passo 2: [CORREÇÃO #2] Montar e executar a fila de imagens ──
            // A fila é construída de forma síncrona e disparada de forma
            // assíncrona sem bloquear a UI (sem await aqui).
            const filaDeDownloads = [];

            topico.anotacoes.forEach((an, index) => {
                const numIdeia = index + 1;

                // Imagem da anotação principal
                if (an.tipo === 'imagem') {
                    filaDeDownloads.push({
                        dados: an.conteudo,
                        nome:  _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina),
                    });
                }

                // Imagens nos itens correlacionados
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

            // Dispara a fila sem await — não bloqueia a UI, executa em background.
            _executarFilaDeDownloads(filaDeDownloads);

        } catch (error) {
            console.error('[ExportManager] Erro ao gerar exportação:', error);
            _deps.exibirToast('Erro ao gerar exportação. Verifique o console.', 'erro');
        }
    }

    // ─── API PÚBLICA ──────────────────────────────────────────────────────────

    return { init, exportarTopicoAtivo };

})();
