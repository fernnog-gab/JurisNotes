/*
 * JurisEditor (Módulo AI) — Motor de edição visual (WYSIWYG)
 */
window.JurisEditor = (function () {

    const editorEl = () => document.getElementById('edit-text-input');

    function init() {
        const el = editorEl();
        if (!el) return;
        el.addEventListener('input', _atualizarEstadoVazio);
        el.addEventListener('paste', _interceptarColagem);
        el.addEventListener('keydown', _atalhosTeclado);
        _atualizarEstadoVazio(); 
    }

    function _atualizarEstadoVazio() {
        const el = editorEl();
        if (!el) return;
        if (el.innerText.trim() === '') {
            el.innerHTML = '';
            el.classList.add('is-empty');
        } else {
            el.classList.remove('is-empty');
        }
    }

    function _atalhosTeclado(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); formatar('bold'); }
        if (k === 'i') { e.preventDefault(); formatar('italic'); }
        if (k === 'u') { e.preventDefault(); formatar('underline'); }
    }

    function formatar(comando) {
        document.execCommand(comando, false, null);
        editorEl().focus();
        _atualizarEstadoVazio();
    }

    function aplicarTamanho(classeTamanho) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;

        const span = document.createElement('span');
        span.className = classeTamanho;

        try {
            range.surroundContents(span);
        } catch (err) {
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }

        sel.removeAllRanges();
        const novoRange = document.createRange();
        novoRange.selectNodeContents(span);
        sel.addRange(novoRange);

        editorEl().focus();
        _atualizarEstadoVazio();
    }

    function _interceptarColagem(e) {
        e.preventDefault();
        const texto = (e.originalEvent || e).clipboardData.getData('text/plain');
        const htmlSeguro = markdownParaHtml(texto);
        document.execCommand('insertHTML', false, htmlSeguro);
        _atualizarEstadoVazio();
    }

    function _normalizarDOM(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;

        temp.querySelectorAll('span').forEach(span => {
            if (span.classList.contains('txt-largo-1') || span.classList.contains('txt-largo-2')) return;

            const cs = span.style;
            const isBold = cs.fontWeight === 'bold' || cs.fontWeight === 'bolder' || parseInt(cs.fontWeight, 10) >= 600;
            const isItalic = cs.fontStyle === 'italic';
            const isUnderline = (cs.textDecorationLine || cs.textDecoration || '').includes('underline');

            if (isBold || isItalic || isUnderline) {
                let node = document.createDocumentFragment();
                while (span.firstChild) node.appendChild(span.firstChild);

                if (isUnderline) { const u = document.createElement('u'); u.appendChild(node); node = u; }
                if (isItalic)    { const i = document.createElement('i'); i.appendChild(node); node = i; }
                if (isBold)      { const b = document.createElement('b'); b.appendChild(node); node = b; }

                span.replaceWith(node);
                return;
            }

            if (!span.className && !span.getAttribute('style')) {
                span.replaceWith(...span.childNodes);
            }
        });
        return temp.innerHTML;
    }

    function htmlParaMarkdown(html) {
        let md = _normalizarDOM(html);
        md = md.replace(/<div>/gi, '\n').replace(/<\/div>/gi, '');
        md = md.replace(/<p>/gi, '\n').replace(/<\/p>/gi, '');
        md = md.replace(/<br\s*[\/]?>/gi, '\n');
        md = md.replace(/<span[^>]*class="[^"]*\btxt-largo-1\b[^"]*"[^>]*>/gi, '[[size:1]]');
        md = md.replace(/<span[^>]*class="[^"]*\btxt-largo-2\b[^"]*"[^>]*>/gi, '[[size:2]]');
        md = md.replace(/<\/span>/gi, '[[/size]]');
        md = md.replace(/<(b|strong)[^>]*>/gi, '**').replace(/<\/(b|strong)>/gi, '**');
        md = md.replace(/<(i|em)[^>]*>/gi, '*').replace(/<\/(i|em)>/gi, '*');
        md = md.replace(/<u[^>]*>/gi, '[[u]]').replace(/<\/u>/gi, '[[/u]]');
        md = md.replace(/<[^>]*>/gm, '');
        return md.trim();
    }

    function markdownParaHtml(md) {
        if (!md) return '';
        let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\*([\s\S]+?)\*/g, '<i>$1</i>');
        html = html.replace(/\[\[u\]\]([\s\S]*?)\[\[\/u\]\]/g, '<u>$1</u>');
        html = html.replace(/\[\[size:1\]\]([\s\S]*?)\[\[\/size\]\]/g, '<span class="txt-largo-1">$1</span>');
        html = html.replace(/\[\[size:2\]\]([\s\S]*?)\[\[\/size\]\]/g, '<span class="txt-largo-2">$1</span>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function _bancoParaMarkdownExterno(bancoMd) {
        let md = bancoMd;
        md = md.replace(/\[\[u\]\]/g, '<u>').replace(/\[\[\/u\]\]/g, '</u>');
        md = md.replace(/\[\[size:\d\]\]/g, '').replace(/\[\[\/size\]\]/g, '');
        return md;
    }

    async function copiarComo(formato) {
        const el = editorEl();
        const conteudoHtml = el.innerHTML;
        if (formato === 'html') {
            const bancoMd = htmlParaMarkdown(conteudoHtml);
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([conteudoHtml], { type: 'text/html' }),
                        'text/plain': new Blob([_bancoParaMarkdownExterno(bancoMd)], { type: 'text/plain' })
                    })
                ]);
                exibirToast('Texto formatado copiado!', 'sucesso');
            } catch (e) {
                exibirToast('Não foi possível copiar o texto formatado.', 'erro');
            }
        } else {
            const md = _bancoParaMarkdownExterno(htmlParaMarkdown(conteudoHtml));
            navigator.clipboard.writeText(md).then(() => exibirToast('Markdown copiado para IA!', 'sucesso'));
        }
    }

    return { init, formatar, aplicarTamanho, copiarComo, htmlParaMarkdown, markdownParaHtml };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (window.JurisEditor) JurisEditor.init();
});