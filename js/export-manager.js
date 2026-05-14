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

    function _formatarCitacao(texto) {
        if (!texto) return '> [Conteúdo não especificado]';
        return texto.split('\n').map(linha => `> ${linha}`).join('\n');
    }

    function _gerarMarkdown(topico) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        let md = `---
*Pacote de Dados Extraídos via Juris Notes em ${dataGeracao}*
---

# ANÁLISE DE TÓPICO RECURSAL: **${topico.nome.toUpperCase()}**
> *Documento estruturado contendo extrações factuais, recortes e transcrições vinculadas a este tópico.*

`;

        topico.anotacoes.forEach((an, index) => {
            const numItem = index + 1;
            const documento = an.documento || 'Documento não classificado';
            const polo = an.polo || 'Polo não especificado';
            const idFormt = an.pjeId ? `(ID PJe: ${an.pjeId})` : '';
            const folha = an.pagina ? `Fl. ${an.pagina}` : '';
            
            md += `## [Item ${numItem}] Origem: ${documento} | Parte: ${polo}\n`;
            md += `**Localização:** ${folha} ${idFormt}\n\n`;

            if (an.tipo === 'texto') {
                md += `### 📄 Fato / Trecho Documental:\n`;
                md += _formatarCitacao(an.conteudo) + `\n\n`;
                if (an.comentario) md += `> 💬 **Nota do Assessor:** ${an.comentario}\n\n`;
            } 
            else if (an.tipo === 'imagem') {
                md += `### 🖼️ Evidência Visual (Recorte da Peça):\n`;
                const desc = an.comentario ? an.comentario : "[Imagem anexada aos autos sem descrição fornecida pelo assessor.]";
                md += _formatarCitacao(`**Descrição/Contexto:** ${desc}`) + `\n\n`;
            }
            else if (an.tipo === 'audio') {
                try {
                    const audioData = JSON.parse(an.conteudo);
                    md += `### 🎙️ Registro de Oitiva/Audiência:\n`;
                    md += `**Orador:** ${audioData.oradorStr} | **Marcação:** ${audioData.labelInicio} a ${audioData.labelFim}\n`;
                } catch(e) {
                     md += `### 🎙️ Registro de Oitiva/Audiência:\n`;
                }
                const desc = an.comentario ? an.comentario : "[Sem transcrição detalhada.]";
                md += _formatarCitacao(`**Transcrição/Resumo do Assessor:** ${desc}`) + `\n\n`;
            }

            if (an.subAnotacoes && an.subAnotacoes.length > 0) {
                md += `### 🧠 Conclusões / Raciocínio Vinculado:\n`;
                const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                an.subAnotacoes.forEach((sub, sIdx) => {
                    const label = `${numItem}.${sIdx < 26 ? ABC[sIdx] : ABC[Math.floor(sIdx/26)-1] + ABC[sIdx%26]}`;
                    md += `- **[${label}]** ${sub.texto}\n`;
                });
                md += `\n`;
            }

            if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                md += `### 🔗 Provas e Argumentos Agrupados (Corroboração/Contradição):\n`;
                an.itensCorrelacionados.forEach((item, cIdx) => {
                    const iDoc = item.documento || 'Doc. não classificado';
                    const iPolo = item.polo || 'Polo não especificado';
                    md += `- **Ref:** ${iDoc} | ${iPolo} | Fl. ${item.pagina}\n`;
                    
                    if (item.tipo === 'texto') {
                        md += `  > *Trecho:* ${item.conteudo.replace(/\n/g, ' ')}\n\n`;
                    } else if (item.tipo === 'imagem') {
                        md += `  - *Descrição de Imagem Agrupada:* ${item.comentario || "Sem descrição."}\n`;
                    } else if (item.tipo === 'audio') {
                        md += `  - *Resumo de Áudio Agrupado:* ${item.comentario || "Sem transcrição."}\n`;
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
            _deps.exibirToast('Tópico exportado com sucesso para IA (.md)!', 'sucesso');
            
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
