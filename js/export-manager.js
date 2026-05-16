/* ================================================
   export-manager.js
   Módulo responsável por formatar e exportar dados
   do tópico ativo para Markdown (.md), otimizado
   para processamento por LLMs (IA).
   ================================================ */
window.ExportManager = (function() {
    'use strict';

    let _deps = {};

    function init(dependencies) {
        _deps = dependencies;
    }

    async function _downloadImagemSegura(base64Data, nomeArquivo) {
        try {
            const response = await fetch(base64Data);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = nomeArquivo + ".png";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Falha ao baixar imagem:", e);
        }
    }

    function _formatarCitacao(texto) {
        if (!texto) return '> [Conteúdo não especificado]';
        return texto.split('\n').map(linha => `> ${linha}`).join('\n');
    }

    function _resolverBucketDocumento(docNome) {
        if (!docNome) return 'provas';
        const d = docNome.toUpperCase();
        
        const isSentenca = ['SENTENÇA', 'ACÓRDÃO', 'DECISÃO'].some(k => d.includes(k));
        if (isSentenca) return 'sentencas';
        
        const isAtaque = ['RECURSO', 'AGRAVO', 'EMBARGOS'].some(k => d.includes(k));
        if (isAtaque) return 'ataques';
        
        const isDefesa = ['CONTESTAÇÃO', 'CONTRARRAZÕES', 'IMPUGNAÇÃO', 'DEFESA'].some(k => d.includes(k));
        if (isDefesa) return 'defesas';
        
        return 'provas';
    }

    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        let md = `---
*Pacote de Dados Estruturado via Juris Notes em ${dataGeracao}*
---

# TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**

`;
        const dialectica     = { sentencas: [], ataques: [], defesas: [] };
        const provas         = [];
        const diretrizes     = [];
        const vereditos      = []; // Intenção: veredito — tag <decisao_magistrado_pretendida>
        const fundamentacoes = []; // Intenção: fundamentacao — tag <base_legal_obrigatoria>

        topico.anotacoes.forEach((an, index) => {
            const refStr = `(Fl. ${an.pagina || 'não idt.'}${an.pjeId ? `, ID ${an.pjeId}` : ''})`;
            
            // 1. Extração do Fato/Prova Principal
            let textoBloco = "";
            if (an.tipo === 'texto') textoBloco = an.conteudo.replace(/\n/g, ' ');
            else if (an.tipo === 'imagem') textoBloco = `[Imagem/Recorte da Peça] Descrição do Assessor: ${an.comentario || 'Sem descrição.'}`;
            else if (an.tipo === 'audio') {
                 try { const ad = JSON.parse(an.conteudo); textoBloco = `[Áudio: ${ad.oradorStr} - ${ad.labelInicio} a ${ad.labelFim}] Resumo: ${an.comentario || 'Sem transcrição.'}`; } 
                 catch(e) { textoBloco = `[Áudio] Resumo: ${an.comentario}`; }
            }

            // 2. Extraindo Diretrizes e Anexando PREMISSAS DIRETAMENTE ao texto do Bloco pai
            if (an.tese) diretrizes.push(`* **TESE A ADOTAR:** ${an.tese}`);

            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                an.subAnotacoes.forEach(sub => {
                    const intencao = sub.intencao || 'premissa';

                    if (intencao === 'comando') {
                        diretrizes.push(`* **ORDEM DE REDAÇÃO:** ${sub.texto}`);
                    }
                    else if (intencao === 'texto') {
                        diretrizes.push(`* **UTILIZAR ESTA REDAÇÃO EXATA:**\n  > ${sub.texto}`);
                    }
                    else if (intencao === 'premissa') {
                        // Premissa é "grudada" no bloco pai para dar contexto direto à prova
                        textoBloco += `\n    * *Dedução do Assessor:* ${sub.texto}`;
                    }
                    else if (intencao === 'veredito') {
                        // Decisão final: vai para uma seção e tag XML próprias
                        vereditos.push(`* ${sub.texto}`);
                    }
                    else if (intencao === 'fundamentacao') {
                        // Base legal obrigatória: vai para tag XML de máxima prioridade
                        fundamentacoes.push(`* ${sub.texto}`);
                    }
                    // 'nota': intencionalmente ignorada — não exportada para a IA
                });
            }

            // 3. Destinando o Bloco Pai (já com suas premissas coladas) ao Bucket correto
            const bucketType = _resolverBucketDocumento(an.documento);
            const prefixoStr = `* **${an.documento || (an.tipo === 'audio' ? 'Oitiva de Audiência' : 'Prova Documental')} (${an.polo || 'Sem polo'}) ${refStr}:** `;

            if (bucketType === 'sentencas') dialectica.sentencas.push(prefixoStr + textoBloco);
            else if (bucketType === 'ataques') dialectica.ataques.push(prefixoStr + textoBloco);
            else if (bucketType === 'defesas') dialectica.defesas.push(prefixoStr + textoBloco);
            else provas.push(prefixoStr + textoBloco);

            // 4. Processando Provas Agrupadas (Itens Correlacionados sempre vão para Provas)
            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                an.itensCorrelacionados.forEach(item => {
                    const iRef = `(Fl. ${item.pagina || 'não idt.'}${item.pjeId ? `, ID ${item.pjeId}` : ''})`;
                    const iText = item.comentario ? item.comentario : (item.conteudo || '').replace(/\n/g, ' ');
                    provas.push(`  * **Corroboração/Contradição (${item.documento || 'Doc'} - ${item.polo || 'Polo'}) ${iRef}:** ${iText}`);
                });
            }
        });

        // --- MONTAGEM DO MARKDOWN OTIMIZADO ---
        md += `## 1. MATRIZ DIALÉTICA DA LIDE\n`;
        if (dialectica.sentencas.length) md += dialectica.sentencas.join('\n\n') + '\n\n';
        if (dialectica.ataques.length) md += dialectica.ataques.join('\n\n') + '\n\n';
        if (dialectica.defesas.length) md += dialectica.defesas.join('\n\n') + '\n\n';
        if (!dialectica.sentencas.length && !dialectica.ataques.length && !dialectica.defesas.length) {
            md += `*Não foram mapeadas peças processuais estritas (Recursos/Sentenças) para compor a dialética.*\n\n`;
        }

        md += `## 2. MAPEAMENTO PROBATÓRIO E PREMISSAS\n`;
        if (provas.length > 0) md += provas.join('\n\n') + '\n\n';
        else md += `*Nenhuma prova específica ou premissa lógica foi mapeada neste tópico.*\n\n`;

        md += `## 3. 🎯 DIRETRIZES DE REDAÇÃO PARA A IA\n`;
        md += `<comandos_para_a_minuta>\n`; 
        if (diretrizes.length > 0) md += diretrizes.join('\n\n') + '\n';
        else md += `* Analise a matriz dialética e as provas acima para construir a fundamentação do voto, seguindo os padrões do tribunal.\n`;
        md += `</comandos_para_a_minuta>\n`;

        md += `\n## 4. 🏛️ DECISÃO DO MAGISTRADO\n`;
        md += `<decisao_magistrado_pretendida>\n`;
        if (vereditos.length > 0) {
            md += vereditos.join('\n\n') + '\n';
        } else {
            md += `* [Nenhum veredito explícito definido. Extraia a conclusão da dialética e das provas acima.]\n`;
        }
        md += `</decisao_magistrado_pretendida>\n`;

        md += `\n## 5. 📚 BASE LEGAL OBRIGATÓRIA\n`;
        md += `<base_legal_obrigatoria>\n`;
        if (fundamentacoes.length > 0) {
            md += fundamentacoes.join('\n\n') + '\n';
        } else {
            md += `* [Nenhuma súmula ou artigo específico foi marcado. Utilize o repertório jurisprudencial pertinente.]\n`;
        }
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
        if (!activeId) {
            _deps.exibirToast('Selecione um tópico antes de gerar o documento.', 'aviso');
            return;
        }

        const topicosAtuais = _deps.getTopicos();
        const topico = topicosAtuais.find(t => t.id === activeId);

        if (!topico) {
            _deps.exibirToast('Tópico não encontrado. Tente novamente.', 'erro');
            return;
        }

        if (topico.anotacoes.length === 0) {
            _deps.exibirToast('Este tópico está vazio. Adicione anotações antes de exportar.', 'aviso');
            return;
        }

        try {
            const markdownConteudo = _gerarMarkdown(topico);
            const nomeSanitizado = topico.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const nomeArquivo = `Tese_${nomeSanitizado}.md`;
            
            _downloadArquivo(nomeArquivo, markdownConteudo);
            _deps.exibirToast('Tópico exportado com sucesso para IA (.md)! Imagens sendo baixadas...', 'sucesso');
            
            // Loop para exportar recortes de imagem como PNGs
            let delayDownload = 500;
            topico.anotacoes.forEach((an, anIdx) => {
                if (an.tipo === 'imagem') {
                    setTimeout(() => {
                        const folha = an.pagina || 'Folha_Indef';
                        const id = an.pjeId ? `_ID_${an.pjeId}` : '';
                        _downloadImagemSegura(an.conteudo, `Imagem_Ideia_${anIdx + 1}_Folha_${folha}${id}`);
                    }, delayDownload);
                    delayDownload += 500;
                }
                
                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        if (corr.tipo === 'imagem') {
                            setTimeout(() => {
                                const folha = corr.pagina || 'Folha_Indef';
                                const id = corr.pjeId ? `_ID_${corr.pjeId}` : '';
                                _downloadImagemSegura(corr.conteudo, `Imagem_Agrupada_${anIdx + 1}.${corrIdx + 1}_Folha_${folha}${id}`);
                            }, delayDownload);
                            delayDownload += 500;
                        }
                    });
                }
            });

        } catch (error) {
            console.error(error);
            _deps.exibirToast('Erro ao gerar o arquivo de exportação.', 'erro');
        }
    }

    return {
        init,
        exportarTopicoAtivo
    };
})();
