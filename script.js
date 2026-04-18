// ───────── STATE ─────────
    const state = {
      step: 1, room: null, ws: null,
      connected: false, mode: null, streaming: false, remoteLocked: false,
      localStream: null, peerConn: null,
      remoteConnected: false, remoteVolume: 0.5, micMuted: false
    };

    const ui = {
      tabs: document.querySelectorAll('.tab'),
      panels: { voice: document.getElementById('voicePanel'), remote: document.getElementById('remotePanel') },
      roomCode: document.getElementById('roomCode'), joinBtn: document.getElementById('joinRoomBtn'),
      dots: [document.getElementById('dot1'), document.getElementById('dot2'), document.getElementById('dot3')],
      connLed: document.getElementById('connLed'), connText: document.getElementById('connText'),
      modeLed: document.getElementById('modeLed'), modeText: document.getElementById('modeText'),
      pairBtn: document.getElementById('pairBtn'),
      txBtn: document.getElementById('txBtn'), rxBtn: document.getElementById('rxBtn'),
      talkBtn: document.getElementById('talkBtn'),
      micState: document.getElementById('micState'), spkState: document.getElementById('spkState'),
      remoteConnectBtn: document.getElementById('remoteConnectBtn'),
      remoteLed: document.getElementById('remoteLed'), remoteText: document.getElementById('remoteText'),
      remoteLockBtn: document.getElementById('remoteLockBtn'),
      remoteVolUpBtn: document.getElementById('remoteVolUpBtn'),
      remoteVolDnBtn: document.getElementById('remoteVolDnBtn'),
      remoteMicBtn: document.getElementById('remoteMicBtn'),
      remoteAudio: document.getElementById('remoteAudio')
    };

    // ───────── TAB SWITCHING ─────────
    ui.tabs.forEach(t => t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      ui.tabs.forEach(x => x.classList.remove('active'));
      Object.values(ui.panels).forEach(p => p.classList.remove('active'));
      t.classList.add('active');
      ui.panels[tab].classList.add('active');
    }));

    // ───────── WEBSOCKET SIGNALING ─────────
    const PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_URL = `${PROTOCOL}//${window.location.host}`;

    function connectWS() {
      state.ws = new WebSocket(WS_URL);
      state.ws.onopen = () => console.log('✅ WS Connected');
      state.ws.onmessage = (e) => handleSignal(JSON.parse(e.data));
      state.ws.onclose = () => setTimeout(connectWS, 2000);
    }

    function sendSignal(data) { state.ws?.readyState === WebSocket.OPEN && state.ws.send(JSON.stringify(data)); }

    function handleSignal(data) {
      switch(data.type) {
        case 'offer': setupReceiver(data.sdp); break;
        case 'answer': state.peerConn?.setRemoteDescription(new RTCSessionDescription(data.sdp)); break;
        case 'candidate': state.peerConn?.addIceCandidate(new RTCIceCandidate(data.candidate)); break;
        case 'lock': state.remoteLocked = true; state.mode = 'rx'; state.streaming = true; updateUI(); vibrate(100); break;
        case 'unlock': state.remoteLocked = false; state.mode = null; state.streaming = false; updateUI(); vibrate(50); break;
        case 'remote_cmd':
          if (data.cmd === 'lock') { if(!state.remoteLocked) sendSignal({type:'lock', room:state.room}); else sendSignal({type:'unlock', room:state.room}); }
          else if (data.cmd === 'vol_up') ui.remoteAudio.volume = Math.min(1, ui.remoteAudio.volume + 0.1);
          else if (data.cmd === 'vol_down') ui.remoteAudio.volume = Math.max(0, ui.remoteAudio.volume - 0.1);
          else if (data.cmd === 'mic_toggle') toggleMic();
          break;
      }
    }

    // ───────── WEBRTC SETUP ─────────
    async function setupWebRTC(mode) {
      state.peerConn = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      state.peerConn.ontrack = (e) => { ui.remoteAudio.srcObject = e.streams[0]; ui.remoteAudio.play().catch(()=>{}); };
      state.peerConn.onicecandidate = (e) => e.candidate && sendSignal({ type: 'candidate', candidate: e.candidate, room: state.room });

      if (mode === 'tx') {
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.localStream.getTracks().forEach(t => {
          t.enabled = !state.micMuted;
          state.peerConn.addTrack(t, state.localStream);
        });
        const offer = await state.peerConn.createOffer();
        await state.peerConn.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer, room: state.room });
      }
    }

    async function setupReceiver(offerSDP) {
      await setupWebRTC('rx');
      await state.peerConn.setRemoteDescription(new RTCSessionDescription(offerSDP));
      const answer = await state.peerConn.createAnswer();
      await state.peerConn.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: answer, room: state.room });
    }

    function toggleMic() {
      state.micMuted = !state.micMuted;
      if (state.localStream) {
        state.localStream.getAudioTracks().forEach(t => t.enabled = !state.micMuted);
      }
      ui.remoteMicBtn.classList.toggle('active', state.micMuted);
      ui.micState.textContent = state.micMuted ? 'MUTED' : 'ON';
      ui.micState.className = state.micMuted ? 'off' : 'on';
      console.log(`🎙️ Mic ${state.micMuted ? 'Muted' : 'Active'}`);
    }

    // ───────── BLUETOOTH LOGIC ─────────
    async function checkPrePaired() {
      if (!navigator.bluetooth) return false;
      try {
        const devices = await navigator.bluetooth.getDevices();
        if (devices.length > 0) {
          state.connected = true;
          ui.pairBtn.textContent = '✅ Ready (Pre-Paired)';
          updateUI();
          console.log('🔗 Auto-connected to pre-paired device');
          return true;
        }
      } catch (e) { console.warn('getDevices error:', e); }
      return false;
    }

    ui.pairBtn.addEventListener('click', async () => {
      vibrate(50);
      if (!navigator.bluetooth) return alert('Web Bluetooth not supported.');
      try {
        ui.pairBtn.textContent = '⏳ Waiting approval...'; ui.pairBtn.disabled = true;
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        state.connected = true;
        ui.pairBtn.textContent = `✅ Connected: ${device.name || 'Device'}`;
        updateUI(); vibrate([100,50,100]);
      } catch (err) {
        ui.pairBtn.textContent = '🔍 Scan & Pair'; ui.pairBtn.disabled = false;
      }
    });

    ui.remoteConnectBtn.addEventListener('click', async () => {
      vibrate(50);
      if (!navigator.bluetooth) return alert('Web Bluetooth required.');
      try {
        ui.remoteConnectBtn.textContent = '⏳ Searching...'; ui.remoteConnectBtn.disabled = true;
        await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        state.remoteConnected = true;
        ui.remoteConnectBtn.textContent = '✅ Remote Connected';
        ui.remoteLockBtn.disabled = false;
        ui.remoteVolUpBtn.disabled = false; ui.remoteVolDnBtn.disabled = false;
        ui.remoteMicBtn.disabled = false;
        updateRemoteUI(); vibrate([100,50,100]);
      } catch (err) {
        ui.remoteConnectBtn.textContent = '🔍 Search & Connect Remote'; ui.remoteConnectBtn.disabled = false;
      }
    });

    // ───────── REMOTE CONTROLS ─────────
    ui.remoteLockBtn.addEventListener('click', () => {
      vibrate(60);
      if (!state.remoteConnected || !state.room) return;
      sendSignal({ type: 'remote_cmd', cmd: 'lock', room: state.room });
      if (!state.remoteLocked) {
        ui.remoteLockBtn.textContent = '🔓\nUNLOCK';
        ui.remoteLockBtn.style.borderColor = '#10b981'; ui.remoteLockBtn.style.color = '#10b981';
      } else {
        ui.remoteLockBtn.textContent = '🔒\nLOCK';
        ui.remoteLockBtn.style.borderColor = ''; ui.remoteLockBtn.style.color = '';
      }
    });
    ui.remoteVolUpBtn.addEventListener('click', () => {
      vibrate(40);
      if (!state.remoteConnected || !state.room) return;
      sendSignal({ type: 'remote_cmd', cmd: 'vol_up', room: state.room });
      ui.remoteAudio.volume = Math.min(1, ui.remoteAudio.volume + 0.1);
    });
    ui.remoteVolDnBtn.addEventListener('click', () => {
      vibrate(40);
      if (!state.remoteConnected || !state.room) return;
      sendSignal({ type: 'remote_cmd', cmd: 'vol_down', room: state.room });
      ui.remoteAudio.volume = Math.max(0, ui.remoteAudio.volume - 0.1);
    });
    ui.remoteMicBtn.addEventListener('click', () => {
      vibrate(50);
      if (!state.remoteConnected || !state.room) return;
      sendSignal({ type: 'remote_cmd', cmd: 'mic_toggle', room: state.room });
      toggleMic();
    });

    // ───────── UI & STATE ─────────
    function updateUI() {
      ui.dots.forEach((d,i) => { d.classList.toggle('active', i === state.step - 1); d.classList.toggle('done', i < state.step - 1); });
      ui.connLed.className = state.connected ? 'led blue' : 'led yellow';
      ui.connText.textContent = state.connected ? 'Paired' : 'Disconnected';

      if (state.remoteLocked) {
        ui.txBtn.disabled = true; ui.txBtn.classList.remove('active');
        ui.rxBtn.disabled = true; ui.rxBtn.classList.add('active', 'locked');
        ui.modeLed.className = 'led white'; ui.modeText.textContent = '🔊 Receiving (Locked)';
        ui.talkBtn.disabled = true; ui.talkBtn.textContent = '🔒 LISTENING...'; ui.talkBtn.className = 'btn action listening';
        ui.micState.textContent = 'OFF'; ui.micState.className = 'off';
        ui.spkState.textContent = 'ON'; ui.spkState.className = 'on';
        state.step = 3; return;
      }

      ui.txBtn.disabled = !state.connected; ui.rxBtn.disabled = !state.connected;
      ui.txBtn.classList.toggle('active', state.mode === 'tx');
      ui.rxBtn.classList.toggle('active', state.mode === 'rx');
      ui.modeLed.className = state.mode === 'tx' ? 'led green' : state.mode === 'rx' ? 'led white' : 'led off';
      ui.modeText.textContent = state.mode === 'tx' ? 'Transmitter' : state.mode === 'rx' ? 'Receiver' : 'Select Mode';

      ui.talkBtn.disabled = !state.connected || !state.mode;
      ui.talkBtn.textContent = state.streaming ? '⏹️ STOP TALK' : '▶️ START TALK';
      ui.talkBtn.className = state.streaming ? 'btn action recording' : 'btn action';

      ui.micState.textContent = state.mode === 'tx' ? (state.micMuted ? 'MUTED' : (state.streaming ? 'ON' : 'OFF')) : 'OFF';
      ui.micState.className = state.mode === 'tx' && state.streaming && !state.micMuted ? 'on' : 'off';
      ui.spkState.textContent = state.mode === 'rx' && state.streaming ? 'ON' : 'OFF';
      ui.spkState.className = state.mode === 'rx' && state.streaming ? 'on' : 'off';

      if (state.connected) state.step = 2;
      if (state.mode) state.step = 3;
    }

    function updateRemoteUI() {
      ui.remoteLed.className = state.remoteConnected ? 'led purple' : 'led yellow';
      ui.remoteText.textContent = state.remoteConnected ? 'Remote Connected' : 'Remote Disconnected';
    }

    function vibrate(ms) { navigator.vibrate && navigator.vibrate(ms); }

    // ───────── EVENT LISTENERS ─────────
    ui.joinBtn.addEventListener('click', () => {
      const room = ui.roomCode.value.trim();
      if (!room) return alert('Enter a room code');
      state.room = room;
      ui.roomCode.disabled = true; ui.joinBtn.disabled = true; ui.pairBtn.disabled = false;
      connectWS();
    });
    ui.txBtn.addEventListener('click', () => { state.mode = 'tx'; vibrate(80); updateUI(); });
    ui.rxBtn.addEventListener('click', () => { state.mode = 'rx'; vibrate(80); updateUI(); });
    ui.talkBtn.addEventListener('click', async () => {
      vibrate(60);
      if (!state.streaming) {
        await setupWebRTC(state.mode);
        state.streaming = true;
        if (state.mode === 'tx') sendSignal({ type: 'lock', room: state.room });
        updateUI();
      } else {
        if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
        if (state.peerConn) state.peerConn.close();
        ui.remoteAudio.srcObject = null;
        state.streaming = false;
        if (state.mode === 'tx') sendSignal({ type: 'unlock', room: state.room });
        updateUI(); vibrate(150);
      }
    });

    // INIT
    updateUI();
    checkPrePaired();