/* ================================================
   audio-manager.js
   Módulo de gravação de marcadores de Oitiva.
   ================================================ */
window.AudioManager = (function() {
    'use strict';

    let _deps = {}; // Recebe dependências externas via init()
    let _audioUrl = null;
    let _timeStart = null;
    let _timeEnd = null;

    // --- Injeção de Dependências ---
    function init(dependencies) {
        _deps = dependencies;
    }

    function formatTime(seconds) {
        if (seconds === null || isNaN(seconds)) return "--' --''";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}' ${s}''`;
    }

    async function iniciarSessao() {
        const topicosAtuais = _deps.getTopicos(); // Correção: uso do getter
        if (!topicosAtuais || topicosAtuais.length === 0) {
            _deps.exibirToast('Crie pelo menos um Tópico Recursal antes de analisar a audiência.', 'aviso');
            return;
        }

        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Áudio da Audiência (MP3/WAV)',
                    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] }
                }]
            });
            const file = await fileHandle.getFile();
            
            if (_audioUrl) URL.revokeObjectURL(_audioUrl);
            _audioUrl = URL.createObjectURL(file);
            
            document.getElementById('main-audio-player').src = _audioUrl;
            document.getElementById('active-audio-indicator').style.display = 'flex';
            
            abrirPlayer();
            _deps.exibirToast('Audiência carregada com sucesso!', 'sucesso');
        } catch (err) {
            if (err.name !== 'AbortError') _deps.exibirToast('Erro ao carregar o arquivo.', 'erro');
        }
    }

    function abrirPlayer() { document.getElementById('audio-player-panel').style.display = 'flex'; }
    function fecharPlayer() { document.getElementById('audio-player-panel').style.display = 'none'; }
    function alternarPlayer() {
        const p = document.getElementById('audio-player-panel');
        p.style.display = (p.style.display === 'none') ? 'flex' : 'none';
    }

    function marcarInicio() {
        const audio = document.getElementById('main-audio-player');
        _timeStart = audio.currentTime;
        document.getElementById('audio-marker-start').innerText = `Início: ${formatTime(_timeStart)}`;
        _deps.exibirToast('Início marcado. Avance o áudio e marque o fim.', 'sucesso');
    }

    function marcarFim() {
        const audio = document.getElementById('main-audio-player');
        if (_timeStart === null) {
            _deps.exibirToast('Marque o início do trecho primeiro!', 'aviso');
            return;
        }
        _timeEnd = audio.currentTime;
        if (_timeEnd <= _timeStart) {
            _deps.exibirToast('O fim deve ser maior que o início.', 'erro');
            return;
        }
        document.getElementById('audio-marker-end').innerText = `Fim: ${formatTime(_timeEnd)}`;
        
        audio.pause();
        abrirModalClassificacao();
    }

    function abrirModalClassificacao() {
        const selectTopico = document.getElementById('audio-topic-select');
        selectTopico.innerHTML = '<option value="">Selecione o Tópico...</option>';
        
        const topicosAtuais = _deps.getTopicos(); // Correção: uso do getter
        topicosAtuais.forEach(t => selectTopico.appendChild(new Option(t.nome, t.id)));
        
        document.getElementById('audio-speaker-role').value = '';
        document.getElementById('audio-speaker-side-box').style.display = 'none';
        document.getElementById('audio-comment').value = '';
        document.getElementById('audio-degravacao').value = '';
        
        const backdrop = document.getElementById('wizard-backdrop');
        if(backdrop) backdrop.style.display = 'block';
        document.getElementById('audio-classification-popup').style.display = 'flex';
    }

    function onRoleChange() {
        const role = document.getElementById('audio-speaker-role').value;
        const sideBox = document.getElementById('audio-speaker-side-box');
        if (role === 'Testemunha' || role === 'Advogado') {
            sideBox.style.display = 'block';
        } else {
            sideBox.style.display = 'none';
        }
    }

    function toggleAgrupar() {
        // Usa Optional Chaining para evitar crash se nenhum radio for encontrado
        const radioSelecionado = document.querySelector('input[name="modo_agrupar_audio"]:checked')?.value;
        const isAgrupar = radioSelecionado === 'agrupar';
        
        const inputIdeia = document.getElementById('audio-input-ideia');
        if (inputIdeia) {
            inputIdeia.style.display = isAgrupar ? 'block' : 'none';
        }
    }

    function salvarRecorte(btnElement) {
        // 1. EXTRAÇÃO SEGURA (Evitando multiplos getElementById espalhados e tratando nulos)
        const inputs = {
            topicoId: document.getElementById('audio-topic-select')?.value,
            role: document.getElementById('audio-speaker-role')?.value,
            poloSecundario: document.getElementById('audio-speaker-side')?.value,
            transcricao: document.getElementById('audio-degravacao')?.value?.trim() || '',
            comment: document.getElementById('audio-comment')?.value?.trim() || '',
            modoAgrupar: document.querySelector('input[name="modo_agrupar_audio"]:checked')?.value || 'nova',
            numIdeiaAgrupamento: document.getElementById('audio-input-ideia')?.value
        };

        // 2. VALIDAÇÃO FAIL-FAST
        if (!inputs.topicoId || !inputs.role) {
            _deps.exibirToast('Tópico e Orador são obrigatórios.', 'aviso'); 
            return;
        }

        // UX: Bloqueia o botão para evitar cliques duplos (Condição de Corrida)
        if (btnElement) btnElement.disabled = true;

        try {
            // 3. TRANSFORMAÇÃO DE DADOS LÓGICOS
            let poloFinal = '';
            let oradorFinal = '';

            switch (inputs.role) {
                case 'Testemunha':
                case 'Advogado':
                    poloFinal = inputs.poloSecundario;
                    oradorFinal = `${inputs.role} da ${poloFinal}`;
                    break;
                case 'Preposto':
                    poloFinal = 'Parte Ré';
                    oradorFinal = 'Preposto (Parte Ré)';
                    break;
                case 'Juízo':
                    poloFinal = 'Juízo';
                    oradorFinal = 'Magistrado / Juízo';
                    break;
                case 'Parte Autora':
                    poloFinal = 'Parte Autora';
                    oradorFinal = 'Depoimento Pessoal (Autora)';
                    break;
                case 'Parte Ré':
                    poloFinal = 'Parte Ré';
                    oradorFinal = 'Depoimento Pessoal (Ré)';
                    break;
            }
            
            let targetIndex = null;
            if (inputs.modoAgrupar === 'agrupar') {
                const numero = parseInt(inputs.numIdeiaAgrupamento, 10);
                const topicosAtuais = _deps.getTopicos(); 
                const topico = topicosAtuais.find(t => t.id === inputs.topicoId);
                
                if (isNaN(numero) || numero < 1 || numero > topico.anotacoes.length) {
                    _deps.exibirToast('Número de agrupamento inválido.', 'erro'); 
                    return;
                }
                targetIndex = numero - 1;
            }

            // CORREÇÃO CRÍTICA: Variável transcricao mapeada corretamente
            const conteudoFormatado = JSON.stringify({
                inicio: _timeStart, 
                fim: _timeEnd,
                oradorStr: oradorFinal,
                role: inputs.role,
                poloTag: poloFinal,
                labelInicio: formatTime(_timeStart), 
                labelFim: formatTime(_timeEnd),
                transcricao: inputs.transcricao 
            });

            // 4. EXECUÇÃO DA AÇÃO
            _deps.salvarAnotacao('audio', conteudoFormatado, 'Ata de Audiência / MP3', poloFinal, inputs.topicoId, inputs.comment, targetIndex);
            
            cancelarAnotacao(); 
            fecharPlayer();     
            _deps.exibirToast('Trecho da oitiva salvo!', 'sucesso');

        } finally {
            // UX: Libera o botão independente de sucesso ou falha no processamento
            if (btnElement) btnElement.disabled = false;
        }
    }

    function cancelarAnotacao() {
        document.getElementById('audio-classification-popup').style.display = 'none';
        const backdrop = document.getElementById('wizard-backdrop');
        if(backdrop) backdrop.style.display = 'none';
        
        _timeStart = null; _timeEnd = null;
        document.getElementById('audio-marker-start').innerText = "Início: --' --''";
        document.getElementById('audio-marker-end').innerText = "Fim: --' --''";
    }

    function encerrar() {
        if (_audioUrl) {
            URL.revokeObjectURL(_audioUrl);
            _audioUrl = null;
        }
        const player = document.getElementById('main-audio-player');
        if (player) player.src = '';
        
        const activeIndicator = document.getElementById('active-audio-indicator');
        if (activeIndicator) activeIndicator.style.display = 'none';
        
        fecharPlayer();
        _timeStart = null; 
        _timeEnd = null;
    }

    async function solicitarMp3Retomada() {
        _deps.exibirToast('Anotações de audiência detectadas. Localize o arquivo MP3 correspondente.', 'aviso');
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Áudio da Audiência (MP3/WAV)',
                    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] }
                }]
            });
            const file = await fileHandle.getFile();
            if (_audioUrl) URL.revokeObjectURL(_audioUrl);
            _audioUrl = URL.createObjectURL(file);
            document.getElementById('main-audio-player').src = _audioUrl;
            
            const activeIndicator = document.getElementById('active-audio-indicator');
            if (activeIndicator) activeIndicator.style.display = 'flex';
            
            abrirPlayer();
            _deps.exibirToast('Áudio restaurado com sucesso!', 'sucesso');
        } catch (err) {
            if (err.name !== 'AbortError') _deps.exibirToast('Erro ao carregar o arquivo MP3.', 'erro');
        }
    }

    return {
        init, iniciarSessao, abrirPlayer, fecharPlayer, alternarPlayer,
        marcarInicio, marcarFim, onRoleChange, toggleAgrupar,
        salvarRecorte, cancelarAnotacao, encerrar, solicitarMp3Retomada
    };
})();
