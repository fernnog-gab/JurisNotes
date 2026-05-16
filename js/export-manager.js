/* ================================================
   export-manager.js
   Módulo de Formatação e Exportação Markdown + Imagens
   Otimizado para LLMs Multimodais (Visão + Texto)
   ================================================ */
window.ExportManager = (function() {
    'use strict';

    let _deps = {};

    function init(dependencies) {
        _deps = dependencies;
    }

    // Utilitário para formatar a citação oficial exigida: (Id Y - fl X)
    function _formatarCitacaoOficial(pjeId, pagina) {
        const strId = pjeId ? `Id ${pjeId}` : 'Id não idt.';
        const strFl = pagina ? `fl ${pagina}` : 'fl não idt.';
        return `(${strId} - ${strFl})`;
    }

    // Utilitário para garantir que o Nome do Arquivo no MD seja IDENTICO ao nome do Download
    function _gerarNomeArquivoImagem(ideiaNum, subNum, pjeId, pagina) {
        const strId = pjeId ? `_Id_${pjeId}` : '';
        const strFl = pagina ? `_fl_${pagina}` : '';
        const hierarquia = subNum ? `${ideiaNum}.${subNum}` : `${ideiaNum}`;
        return `Recorte_Prova_${hierarquia}${strId}${strFl}.png`;
    }

    async function _downloadImagemSegura(base64Data, nomeArquivoBase) {
        try {
            const response = await fetch(base64Data);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = nomeArquivoBase; // O nome já vem com a extensão .png
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Falha ao baixar imagem:", e);
        }
    }

    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        let md = `---
*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*
---

# TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**

## 1. ESTRUTURA CRONOLÓGICA DA LIDE E PROVAS
*(Siga estritamente a ordem lógica abaixo para a fundamentação)*

`;
        const comandosInjetados = [];
        const vereditosExigidos = [];
        const baseLegalObrigatoria = [];

        topico.anotacoes.forEach((an, index) => {
            const numIdeia = index + 1;
            const refCitacao = _formatarCitacaoOficial(an.pjeId, an.pagina);
            
            // Título Principal da Ideia
            md += `### 📌 IDEIA ESTRUTURAL ${numIdeia}: ${an.tese ? an.tese : '[Sem título definido pelo assessor]'}\n`;

            // Processamento do Conteúdo Pai
            const tituloBloco = `**1. [${an.documento || 'Elemento'}] (${an.polo || 'Sem polo'}) ${refCitacao}:**`;
            
            if (an.tipo === 'texto') {
                md += `${tituloBloco} ${an.conteudo.replace(/\n/g, ' ')}\n`;
            } else if (an.tipo === 'imagem') {
                const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                md += `${tituloBloco}\n> 🖼️ **[ANEXO DE IMAGEM]** Leia o arquivo anexado nomeado \`${imgNome}\`.\n> 🧠 *Conclusão/Observação do Assessor:* ${an.comentario || 'Verifique o documento em anexo e extraia a informação correspondente.'}\n`;
            } else if (an.tipo === 'audio') {
                 try { 
                     const ad = JSON.parse(an.conteudo); 
                     md += `${tituloBloco}\n> 🎙️ **[OITIVA DE AUDIÊNCIA]** (${ad.oradorStr} - ${ad.labelInicio} a ${ad.labelFim}).\n> 🧠 *Transcrição/Resumo:* ${an.comentario || 'Sem transcrição explícita.'}\n`;
                 } catch(e) { 
                     md += `${tituloBloco}\n> 🎙️ **[ÁUDIO]** *Resumo:* ${an.comentario}\n`; 
                 }
            }

            // Mapeando Itens Correlacionados (Agrupamentos)
            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach((corr, corrIdx) => {
                    const numSub = corrIdx + 1;
                    const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                    const cTitulo = `  ↳ **Corroboração/Contradição [${corr.documento || 'Doc'}] (${corr.polo || 'Polo'}) ${cRefCitacao}:**`;

                    if (corr.tipo === 'texto') {
                        const txt = corr.comentario ? corr.comentario : (corr.conteudo || '').replace(/\n/g, ' ');
                        md += `${cTitulo} ${txt}\n`;
                    } else if (corr.tipo === 'imagem') {
                        const imgNomeSub = _gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina);
                        const fallbackComentario = 'Atenção IA: O assessor agrupou esta prova com o elemento principal acima. Analise este anexo para extrair a ligação técnica entre eles.';
                        md += `${cTitulo}\n    > 🖼️ **[ANEXO DE IMAGEM]** Leia o arquivo anexado nomeado \`${imgNomeSub}\`.\n    > 🧠 *Conclusão do Assessor:* ${corr.comentario || fallbackComentario}\n`;
                    }
                });
            }

            // Processando Nós de Ideia (Premissas vão aqui, Comandos/Vereditos vão para o fim)
            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                an.subAnotacoes.forEach((sub, sIdx) => {
                    const intencao = sub.intencao || 'premissa';
                    const letraId = String.fromCharCode(65 + sIdx); // A, B, C...

                    if (intencao === 'premissa') {
                        md += `\n  💡 *Dedução Lógica Adicional (Ref ${numIdeia}.${letraId}):* ${sub.texto}\n`;
                    } else if (intencao === 'comando' || intencao === 'texto') {
                        comandosInjetados.push(`* **[Para a Ideia ${numIdeia}]** ${sub.texto}`);
                    } else if (intencao === 'veredito') {
                        vereditosExigidos.push(`* **[Decisão referente à Ideia ${numIdeia}]** ${sub.texto}`);
                    } else if (intencao === 'fundamentacao') {
                        baseLegalObrigatoria.push(`* ${sub.texto} (Aplicável à Ideia ${numIdeia})`);
                    }
                });
            }
            md += `\n---\n\n`; // Separador visual entre as Ideias
        });

        // --- TAGS XML PARA O SISTEMA DA IA ---
        md += `## 2. 🎯 DIRETRIZES DE ESTILO E REDAÇÃO\n`;
        md += `<comandos_para_a_minuta>\n`; 
        if (comandosInjetados.length > 0) md += comandosInjetados.join('\n') + '\n';
        else md += `* Escreva com objetividade e clareza, utilizando as provas do tópico 1.\n`;
        md += `</comandos_para_a_minuta>\n\n`;

        md += `## 3. 🏛️ DECISÃO DO MAGISTRADO (DISPOSITIVO DO TÓPICO)\n`;
        md += `<decisao_magistrado_pretendida>\n`;
        if (vereditosExigidos.length > 0) md += vereditosExigidos.join('\n') + '\n';
        else md += `* [Sintetize a conclusão final de forma coesa com base nos fatos acima apresentados].\n`;
        md += `</decisao_magistrado_pretendida>\n\n`;

        md += `## 4. 📚 BASE LEGAL OBRIGATÓRIA E JURISPRUDÊNCIA\n`;
        md += `<base_legal_obrigatoria>\n`;
        if (baseLegalObrigatoria.length > 0) md += baseLegalObrigatoria.join('\n') + '\n';
        else md += `* [O Assessor não vinculou súmulas específicas. Utilize seu conhecimento jurídico (STF > TST > TRT)].\n`;
        md += `</base_legal_obrigatoria>\n`;

        return md;
    }

    function _downloadArquivo(nomeArquivo, conteudo) {
        const blob = new Blob([conteudo], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", nomeArquivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportarTopicoAtivo() {
        const activeId = _deps.getActiveTabId();
        if (!activeId) { _deps.exibirToast('Selecione um tópico.', 'aviso'); return; }

        const topico = _deps.getTopicos().find(t => t.id === activeId);
        if (!topico || topico.anotacoes.length === 0) {
            _deps.exibirToast('Tópico vazio ou inválido.', 'aviso'); return;
        }

        try {
            // 1. Gerar e baixar o Markdown
            const markdownConteudo = _gerarMarkdown(topico);
            const nomeSanitizado = topico.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '_').toLowerCase();
            _downloadArquivo(`Minuta_${nomeSanitizado}.md`, markdownConteudo);
            
            _deps.exibirToast('Markdown exportado! Processando download das imagens...', 'sucesso');
            
            // 2. Loop de download das imagens (usando a nova regra de nomenclatura unificada)
            let delayDownload = 500;
            topico.anotacoes.forEach((an, index) => {
                const numIdeia = index + 1;

                if (an.tipo === 'imagem') {
                    setTimeout(() => {
                        const imgNome = _gerarNomeArquivoImagem(numIdeia, null, an.pjeId, an.pagina);
                        _downloadImagemSegura(an.conteudo, imgNome);
                    }, delayDownload);
                    delayDownload += 500;
                }
                
                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        if (corr.tipo === 'imagem') {
                            setTimeout(() => {
                                const numSub = corrIdx + 1;
                                const imgNomeSub = _gerarNomeArquivoImagem(numIdeia, numSub, corr.pjeId, corr.pagina);
                                _downloadImagemSegura(corr.conteudo, imgNomeSub);
                            }, delayDownload);
                            delayDownload += 500;
                        }
                    });
                }
            });

        } catch (error) {
            console.error(error);
            _deps.exibirToast('Erro ao gerar exportação.', 'erro');
        }
    }

    return { init, exportarTopicoAtivo };
})();
