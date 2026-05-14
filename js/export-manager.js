/* ================================================
   export-manager.js
   Módulo responsável por formatar e exportar dados
   do tópico ativo para Markdown (.md), otimizado
   para processamento por LLMs (IA).
   ================================================ */
window.ExportManager = (function() {
    'use strict';

    function _formatarCitacao(texto) {
        if (!texto) return '> [Conteúdo não especificado]';
        return texto.split('\n').map(linha => `> ${linha}`).join('\n');
    }

    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        let md = `---
*Arquivo gerado pelo Juris Notes em ${dataGeracao}*
---

# DIRETRIZES DE SISTEMA PARA A INTELIGÊNCIA ARTIFICIAL
Você atua como assistente judicial de segunda instância. O documento abaixo representa o mapeamento analítico de teses, argumentos e provas extraídos de um processo judicial. 
Sua tarefa ao receber este documento é analisar a concatenação lógica das extrações abaixo para compreender o **Tópico Recursal** e auxiliar na elaboração da minuta de voto (acórdão). 
Atenção especial à origem (polo e tipo de documento) de cada alegação e à conexão entre as ideias principais e as secundárias (desdobramentos).

---

# ANÁLISE DO TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**

Abaixo constam as extrações do processo relevantes para o julgamento deste tópico processual.

`;

        topico.anotacoes.forEach((an, index) => {
            const numItem = index + 1;
            const documento = an.documento || 'Documento não classificado';
            const polo = an.polo || 'Polo não especificado';
            const idFormt = an.pjeId ? `(ID PJe: ${an.pjeId})` : '';
            const folha = an.pagina ? `Fl. ${an.pagina}` : '';
            
            md += `## [Item ${numItem}] Extraído de: ${documento} | Parte: ${polo}\n`;
            md += `**Localização no Processo:** ${folha} ${idFormt}\n\n`;

            md += `### 📄 Conteúdo / Evidência:\n`;
            if (an.tipo === 'texto') {
                md += _formatarCitacao(an.conteudo) + `\n\n`;
                if (an.comentario) {
                    md += `> 💬 **Observação do Analista:** ${an.comentario}\n\n`;
                }
            } 
            else if (an.tipo === 'imagem') {
                md += `> *[NOTA DE SISTEMA: Imagem/Recorte extraído do processo. A descrição visual/contextual feita pelo assistente encontra-se abaixo.]*\n>\n`;
                const desc = an.comentario ? an.comentario : "Nenhuma descrição fornecida para esta imagem.";
                md += _formatarCitacao(`**Descrição da Imagem:** ${desc}`) + `\n\n`;
            }
            else if (an.tipo === 'audio') {
                md += `> *[NOTA DE SISTEMA: Trecho de arquivo de áudio/audiência.]*\n>\n`;
                const desc = an.comentario ? an.comentario : "Nenhuma transcrição fornecida para este trecho.";
                md += _formatarCitacao(`**Transcrição/Resumo:** ${desc}`) + `\n\n`;
            }

            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                md += `### 🧠 Desdobramentos / Ideias Secundárias da Análise:\n`;
                const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                an.subAnotacoes.forEach((sub, sIdx) => {
                    const label = `${numItem}.${sIdx < 26 ? ABC[sIdx] : ABC[Math.floor(sIdx/26)-1] + ABC[sIdx%26]}`;
                    md += `- **[${label}]** ${sub.texto}\n`;
                });
                md += `\n`;
            }

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                md += `### 🔗 Provas e Argumentos Agrupados a este Item:\n`;
                an.itensCorrelacionados.forEach((item, cIdx) => {
                    const iDoc = item.documento || 'Doc. não classificado';
                    const iPolo = item.polo || 'Polo não especificado';
                    const iId = item.pjeId ? `(ID: ${item.pjeId})` : '';
                    
                    md += `- **Ref:** ${iDoc} | ${iPolo} | Fl. ${item.pagina} ${iId}\n`;
                    
                    if (item.tipo === 'texto') {
                        md += `  > *Trecho:* ${item.conteudo.replace(/\n/g, ' ')}\n\n`;
                    } else if (item.tipo === 'imagem') {
                        const iDesc = item.comentario || "Sem descrição.";
                        md += `  - *Conteúdo de Imagem Anexada:* ${iDesc.replace(/\n/g, ' ')}\n`;
                    } else if (item.tipo === 'audio') {
                        const iDesc = item.comentario || "Sem transcrição.";
                        md += `  - *Trecho de Áudio Agrupado:* ${iDesc.replace(/\n/g, ' ')}\n`;
                    }
                });
                md += `\n`;
            }

            md += `---\n\n`;
        });

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
        const activeId = TopicsManager.getActiveTabId();

        if (!activeId) {
            exibirToast('Selecione um tópico antes de gerar o documento.', 'aviso');
            return;
        }

        const topico = topicos.find(t => t.id === activeId);

        if (!topico) {
            exibirToast('Tópico não encontrado. Tente novamente.', 'erro');
            return;
        }

        if (topico.anotacoes.length === 0) {
            exibirToast('Este tópico está vazio. Adicione anotações antes de exportar.', 'aviso');
            return;
        }

        try {
            const markdownConteudo = _gerarMarkdown(topico);
            const nomeSanitizado = topico.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const nomeArquivo = `Tese_${nomeSanitizado}.md`;
            
            _downloadArquivo(nomeArquivo, markdownConteudo);
            exibirToast('Tópico exportado com sucesso para IA (.md)!', 'sucesso');
            
        } catch (error) {
            console.error(error);
            exibirToast('Erro ao gerar o arquivo de exportação.', 'erro');
        }
    }

    return {
        exportarTopicoAtivo
    };
})();
