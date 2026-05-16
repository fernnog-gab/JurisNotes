/* ================================================
   export-manager.js
   Módulo de Formatação e Exportação: Markdown + Imagens
   ================================================ */

window.ExportManager = (function () {
    'use strict';

    let _deps = {};

    // ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────

    function init(dependencies) {
        _deps = dependencies;
    }

    // ─── UTILITÁRIOS PRIVADOS ─────────────────────────────────────────────────

    function _formatarCitacaoOficial(pjeId, pagina) {
        const strId = pjeId   ? `Id ${pjeId}`   : 'Id não idt.';
        const strFl = pagina  ? `fl ${pagina}`  : 'fl não idt.';
        return `(${strId} - ${strFl})`;
    }

    function _gerarNomeArquivoImagem(ideiaNum, subNum, pjeId, pagina) {
        const strId      = pjeId   ? `_Id_${pjeId}`   : '';
        const strFl      = pagina  ? `_fl_${pagina}`  : '';
        const hierarquia = subNum  ? `${ideiaNum}.${subNum}` : `${ideiaNum}`;
        return `Recorte_Prova_${hierarquia}${strId}${strFl}.png`;
    }

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
            await new Promise(resolve => setTimeout(resolve, 50));
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(`[ExportManager] Falha ao baixar imagem "${nomeArquivoBase}":`, e);
        }
    }

    async function _executarFilaDeDownloads(fila) {
        if (!fila || fila.length === 0) return;
        _deps.exibirToast(`Iniciando download de ${fila.length} imagem(ns)...`, 'info');
        for (const item of fila) {
            await _downloadImagemSegura(item.dados, item.nome);
            await new Promise(resolve => setTimeout(resolve, 650));
        }
        _deps.exibirToast('Todas as imagens foram baixadas.', 'sucesso');
    }

    // ─── GERADOR DE MARKDOWN ──────────────────────────────────────────────────

    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');

        const comandosInjetados    = [];
        const vereditosExigidos    = [];
        const baseLegalObrigatoria = [];
        const parametrosExigidos   = []; // NOVO — restrições de liquidação/temporais
        const contextoHistorico    = []; // NOVO — tijolos para o Relatório/Introdução

        let md = `---
*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*
---

# TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**

## MATRIZ DIALÉTICA E MAPEAMENTO PROBATÓRIO
*Atenção IA: Esta é a sua fonte de premissas fáticas inconstroversas (Premissa Menor). Integre as âncoras (Id - fl) buscando nos PDFs anexos os detalhes de contexto de cada folha citada.*

`;

        topico.anotacoes.forEach((an, index) => {
            const numIdeia    = index + 1;
            const refCitacao  = _formatarCitacaoOficial(an.pjeId, an.pagina);
            const tituloIdeia = an.tese ? an.tese : '[Tese não nomeada pelo assessor]';

            md += `### 📌 IDEIA ${numIdeia}: ${tituloIdeia}\n\n`;
            const faseContexto  = an.fase || an.documento || 'Não especificado';
            const poloContexto  = an.polo || 'N/A';
            md += `> 📂 *Contexto Processual:* **${faseContexto}** | Polo: **${poloContexto}** | Referência: **${refCitacao}**\n\n`;

            const docLabel = `**[${an.documento || 'Elemento'}] (${an.polo || 'Sem polo'}) ${refCitacao}:**`;

            if (an.tipo === 'texto') {
                md += `- ${docLabel} ${an.conteudo.replace(/\n/g, ' ')}\n`;
            } else if (an.tipo === 'imagem') {
                const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                md += `- ${docLabel}\n  > 🖼️ **[IMAGEM: \`${imgNome}\`]**\n  > 🧠 *Comentário:* ${an.comentario || 'Extraia a informação.'}\n`;
            } else if (an.tipo === 'audio') {
                try {
                    const ad = JSON.parse(an.conteudo);
                    md += `- ${docLabel} 🎙️ **[OITIVA]** (${ad.oradorStr || 'Orador'} — ${ad.labelInicio} a ${ad.labelFim}).\n  > 🧠 *Resumo:* ${an.comentario || 'N/A'}\n`;
                } catch (e) { md += `- ${docLabel} 🎙️ **[ÁUDIO]**\n`; }
            }

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr, corrIdx) => {
                    const numSub = corrIdx + 1;
                    const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                    const cDocLabel = `  ↳ *Confronto [${corr.documento || 'Doc'}] ${cRefCitacao}:*`;
                    if (corr.tipo === 'texto') md += `${cDocLabel} ${corr.conteudo || ''}\n`;
                    else if (corr.tipo === 'imagem') md += `${cDocLabel}\n    > 🖼️ **[\`${_gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina)}\`]**\n`;
                });
            }

            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                an.subAnotacoes.forEach((sub) => {
                    const intencao = sub.intencao || 'premissa';
                    if (intencao === 'premissa') {
                        md += `\n  💡 **Premissa Lógica:** ${sub.texto}\n`;
                    } else if (intencao === 'comando') {
                        comandosInjetados.push(`[Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'texto') {
                        comandosInjetados.push(`[Ideia ${numIdeia} — TEXTO FIXO]: "${sub.texto}"`);
                    } else if (intencao === 'veredito') {
                        vereditosExigidos.push(`[Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'fundamentacao') {
                        baseLegalObrigatoria.push(`[Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'refutacao') {
                        md += `\n  🛡️ **Ponto de Refutação Exigido pelo Assessor:** ${sub.texto}\n`;
                    } else if (intencao === 'parametro') {
                        parametrosExigidos.push(`[Referente à Ideia ${numIdeia}]: ${sub.texto}`);
                    } else if (intencao === 'sintese') {
                        contextoHistorico.push(`* ${sub.texto}`);
                    }
                });
            }
            md += `\n---\n\n`;
        });

        // ── BLOCOS GLOBAIS DE ARQUITETURA ─────────────────────────
        md += `<contexto_historico_do_relatorio>\n`;
        if (contextoHistorico.length > 0) md += contextoHistorico.join('\n') + '\n';
        else md += `* Nenhum contexto histórico destacado pelo Assessor. Inferir do Relatório do processo.\n`;
        md += `</contexto_historico_do_relatorio>\n\n`;

        md += `<comandos_para_a_minuta>\n`;
        if (comandosInjetados.length > 0) md += comandosInjetados.map(c => `* ${c}`).join('\n') + '\n';
        else md += `* Elabore a minuta de forma fluida.\n`;
        md += `</comandos_para_a_minuta>\n\n`;

        md += `<base_legal_obrigatoria>\n`;
        if (baseLegalObrigatoria.length > 0) md += baseLegalObrigatoria.map(c => `* ${c}`).join('\n') + '\n';
        else md += `* O Assessor não vinculou base legal obrigatória.\n`;
        md += `</base_legal_obrigatoria>\n\n`;

        md += `<parametros_e_limitadores_da_condenacao>\n`;
        if (parametrosExigidos.length > 0) {
            md += parametrosExigidos.map(c => `* ${c}`).join('\n') + '\n';
            md += `\n*Atenção IA: Respeite estritamente estes parâmetros ao redigir o dispositivo. Inclua um parágrafo de ressalva antes da conclusão.*\n`;
        } else md += `* Sem parâmetros especiais definidos.\n`;
        md += `</parametros_e_limitadores_da_condenacao>\n\n`;

        md += `<decisao_magistrado_pretendida>\n`;
        if (vereditosExigidos.length > 0) {
            md += vereditosExigidos.map(c => `* ${c}`).join('\n') + '\n';
            md += `\n*Sintetize estas decisões parciais em um dispositivo de tópico claro.*\n`;
        } else md += `* [Assessor não definiu o veredito].\n`;
        md += `</decisao_magistrado_pretendida>\n`;

        return md;
    }

    function _downloadArquivo(nomeArquivo, conteudo) {
        const blob = new Blob([conteudo], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        const url  = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', nomeArquivo);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportarTopicoAtivo() {
        const activeId = _deps.getActiveTabId();
        const topico = _deps.getTopicos().find(t => t.id === activeId);
        if (!topico || topico.anotacoes.length === 0) return;

        try {
            const markdownConteudo = _gerarMarkdown(topico);
            const nomeSanitizado = topico.nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            _downloadArquivo(`Pacote_JurisNotes_${nomeSanitizado}.md`, markdownConteudo);
            
            const filaDeDownloads = [];
            topico.anotacoes.forEach((an, index) => {
                if (an.tipo === 'imagem') filaDeDownloads.push({ dados: an.conteudo, nome: _gerarNomeArquivoImagem(index + 1, null, an.pjeId, an.pagina) });
                if (an.itensCorrelacionados) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        if (corr.tipo === 'imagem') filaDeDownloads.push({ dados: corr.conteudo, nome: _gerarNomeArquivoImagem(index + 1, corrIdx + 1, corr.pjeId, corr.pagina) });
                    });
                }
            });
            _executarFilaDeDownloads(filaDeDownloads);
        } catch (error) { console.error(error); }
    }

    return { init, exportarTopicoAtivo };
})();