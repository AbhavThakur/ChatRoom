/**
 * WebRTC Huddle & Screen Sharing Controller (Production Grade)
 * Provides peer-to-peer audio, video, and screen sharing directly in channels
 * with robust candidate queueing, mobile audio autoplay unlock, and live speaker detection.
 */

class HuddleManager {
  constructor() {
    this.isInHuddle = false;
    this.currentRoom = null;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // peerId -> { connection, stream, username, pendingCandidates, audioContext, analyser }
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
    this.isMuted = false;
    this.isCamOff = true;
    this.isSharingScreen = false;
    this.audioContext = null;
    this.localAnalyser = null;
    this.analyserInterval = null;
  }

  async joinHuddle(room) {
    if (this.isInHuddle) return;
    this.currentRoom = room;

    try {
      // 1. Get user media (mic enabled, camera off by default for fast lightweight huddle)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      this.isInHuddle = true;
      this.isMuted = false;
      this.isCamOff = true;
      this.isSharingScreen = false;

      // 2. Setup voice activity detection for local user
      this.setupLocalAudioAnalyser();

      // 3. Render UI overlay
      this.renderHuddleOverlay(room);
      this.updateHeaderHuddleButton(true);

      // 4. Emit join to signaling server
      socket.emit('huddleJoin', { room });
      showToast('Joined voice huddle 🎙️');
    } catch (err) {
      console.error('Failed to access microphone for huddle:', err);
      let errMsg = 'Microphone permission denied or device unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Please allow microphone access in your browser to join the huddle.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'No microphone device was detected on your device.';
      }
      showToast(`⚠️ ${errMsg}`);
      alert(`Could not start huddle: ${errMsg}`);
    }
  }

  leaveHuddle() {
    if (!this.isInHuddle) return;

    // 1. Stop local audio analyzer
    if (this.analyserInterval) {
      clearInterval(this.analyserInterval);
      this.analyserInterval = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }

    // 2. Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // 3. Close peer connections & remove audio elements
    for (const [id, peer] of this.peers.entries()) {
      if (peer.connection) {
        try { peer.connection.close(); } catch (e) {}
      }
      const audio = document.getElementById(`peer-audio-${id}`);
      if (audio) audio.remove();
      const card = document.getElementById(`peer-card-${id}`);
      if (card) card.remove();
    }
    this.peers.clear();
    this.isInHuddle = false;

    // 4. Remove UI overlay & reset button
    const overlay = document.getElementById('huddle-overlay');
    if (overlay) overlay.remove();
    this.updateHeaderHuddleButton(false);

    socket.emit('huddleLeave');
    showToast('Left huddle');
  }

  toggleMic() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMuted = !audioTrack.enabled;

      const btn = document.getElementById('huddle-btn-mic');
      if (btn) {
        btn.innerHTML = this.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
        btn.classList.toggle('off', this.isMuted);
      }

      const localCard = document.getElementById('peer-card-local');
      if (localCard) {
        const micIcon = localCard.querySelector('.member-mic-status');
        if (micIcon) {
          micIcon.innerHTML = this.isMuted ? '<i class="fas fa-microphone-slash text-red"></i>' : '<i class="fas fa-microphone text-green"></i>';
        }
      }
      showToast(this.isMuted ? 'Microphone muted 🔇' : 'Microphone unmuted 🎙️');
    }
  }

  async toggleCamera() {
    try {
      if (this.isCamOff) {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.isCamOff = false;

        // Add track to all existing peers
        for (const [id, peer] of this.peers.entries()) {
          peer.connection.addTrack(videoTrack, this.localStream);
        }

        const localVideo = document.getElementById('huddle-local-video');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
          localVideo.style.display = 'block';
        }
        showToast('Camera enabled 📷');
      } else {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          this.localStream.removeTrack(videoTrack);
        }
        this.isCamOff = true;
        const localVideo = document.getElementById('huddle-local-video');
        if (localVideo) localVideo.style.display = 'none';
        showToast('Camera disabled');
      }

      const btn = document.getElementById('huddle-btn-cam');
      if (btn) {
        btn.innerHTML = this.isCamOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
        btn.classList.toggle('off', this.isCamOff);
      }
    } catch (err) {
      console.warn('Camera toggle failed:', err);
      showToast('⚠️ Camera access denied or unavailable');
    }
  }

  async toggleScreenShare() {
    try {
      if (!this.isSharingScreen) {
        if (!navigator.mediaDevices.getDisplayMedia) {
          alert('Screen sharing is not supported on mobile browsers.');
          return;
        }

        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = this.screenStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          this.stopScreenShare();
        };

        // Replace or add track on all connections
        for (const [id, peer] of this.peers.entries()) {
          const sender = peer.connection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            peer.connection.addTrack(screenTrack, this.screenStream);
          }
        }

        this.isSharingScreen = true;
        const localVideo = document.getElementById('huddle-local-video');
        if (localVideo) {
          localVideo.srcObject = this.screenStream;
          localVideo.style.display = 'block';
        }

        const btn = document.getElementById('huddle-btn-screen');
        if (btn) btn.classList.add('active');
        showToast('Screen sharing started 🖥️');
      } else {
        this.stopScreenShare();
      }
    } catch (err) {
      console.warn('Screen sharing canceled or failed:', err);
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.isSharingScreen = false;
    const btn = document.getElementById('huddle-btn-screen');
    if (btn) btn.classList.remove('active');

    const localVideo = document.getElementById('huddle-local-video');
    if (localVideo) localVideo.style.display = 'none';
    showToast('Screen sharing stopped');
  }

  // WebRTC Peer Connection Factory
  async createPeerConnection(peerId, isInitiator = false, peerUsername = 'Participant') {
    if (this.peers.has(peerId)) {
      const existing = this.peers.get(peerId);
      if (existing.connection.connectionState !== 'closed') {
        return existing.connection;
      }
    }

    const pc = new RTCPeerConnection(this.config);
    const peerData = {
      connection: pc,
      stream: null,
      username: peerUsername,
      pendingCandidates: []
    };
    this.peers.set(peerId, peerData);

    // 1. Add local tracks immediately
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, this.localStream);
        } catch (e) {
          console.warn('Error adding track:', e);
        }
      });
    }

    // 2. ICE Candidate Exchange
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('huddleSignal', {
          targetId: peerId,
          signal: { candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate }
        });
      }
    };

    // 3. Remote Track Handling (Audio & Video)
    pc.ontrack = (event) => {
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      this.handleRemoteStream(peerId, remoteStream, event.track);
    };

    // 4. Connection State Tracking
    pc.oniceconnectionstatechange = () => {
      console.log(`WebRTC ICE State [${peerId}]:`, pc.iceConnectionState);
      const card = document.getElementById(`peer-card-${peerId}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (card) card.classList.add('connected');
        this.updateHuddleStatusText('Active & Connected 🎙️');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (card) card.classList.remove('connected');
        this.updateHuddleStatusText('Reconnecting...');
      }
    };

    // 5. Render participant card in UI
    this.renderPeerCard(peerId, peerUsername);

    // 6. Direct offer creation for initiator (Avoids onnegotiationneeded race condition)
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        socket.emit('huddleSignal', {
          targetId: peerId,
          signal: { sdp: pc.localDescription }
        });
      } catch (err) {
        console.error('Failed to create WebRTC offer:', err);
      }
    }

    return pc;
  }

  async handleSignal(senderId, signal, senderUsername = 'Participant') {
    let peer = this.peers.get(senderId);
    if (!peer) {
      await this.createPeerConnection(senderId, false, senderUsername);
      peer = this.peers.get(senderId);
    }

    const pc = peer.connection;

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      // Drain any queued ICE candidates that arrived before the SDP description!
      if (peer.pendingCandidates && peer.pendingCandidates.length > 0) {
        for (const cand of peer.pendingCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Error applying queued ICE candidate:', e);
          }
        }
        peer.pendingCandidates = [];
      }

      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('huddleSignal', {
          targetId: senderId,
          signal: { sdp: pc.localDescription }
        });
      }
    } else if (signal.candidate) {
      // If remote description isn't set yet, queue the candidate!
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        if (!peer.pendingCandidates) peer.pendingCandidates = [];
        peer.pendingCandidates.push(signal.candidate);
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          console.warn('Error adding ICE candidate:', err);
        }
      }
    }
  }

  handleRemoteStream(peerId, stream, track) {
    const peer = this.peers.get(peerId);
    if (peer) peer.stream = stream;

    // 1. Dedicated audio element for reliable mobile audio playback
    let audio = document.getElementById(`peer-audio-${peerId}`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `peer-audio-${peerId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;

    // Handle mobile browser autoplay policy
    audio.play().catch(err => {
      console.warn('Audio autoplay prevented on mobile. Awaiting user interaction:', err);
      const unlockAudio = () => {
        audio.play().catch(e => console.warn(e));
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
      };
      document.addEventListener('click', unlockAudio, { once: true });
      document.addEventListener('touchstart', unlockAudio, { once: true });
    });

    // 2. If track is video, show video element
    if (track && track.kind === 'video') {
      let video = document.getElementById(`peer-video-${peerId}`);
      if (!video) {
        video = document.createElement('video');
        video.id = `peer-video-${peerId}`;
        video.autoplay = true;
        video.playsInline = true;
        video.className = 'huddle-peer-tile';
        const card = document.getElementById(`peer-card-${peerId}`);
        if (card) card.appendChild(video);
      }
      video.srcObject = stream;
      video.style.display = 'block';
    }

    // 3. Setup remote audio analyzer for voice activity feedback
    this.setupRemoteAudioAnalyser(peerId, stream);
  }

  setupLocalAudioAnalyser() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 64;
      source.connect(this.localAnalyser);

      const buffer = new Uint8Array(this.localAnalyser.frequencyBinCount);
      this.analyserInterval = setInterval(() => {
        if (!this.isInHuddle || this.isMuted) {
          const card = document.getElementById('peer-card-local');
          if (card) card.classList.remove('speaking');
          return;
        }

        this.localAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const average = sum / buffer.length;

        const card = document.getElementById('peer-card-local');
        if (card) {
          card.classList.toggle('speaking', average > 14);
        }
      }, 120);
    } catch (e) {
      console.warn('Local audio analyser not supported:', e);
    }
  }

  setupRemoteAudioAnalyser(peerId, stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const interval = setInterval(() => {
        if (!this.peers.has(peerId)) {
          clearInterval(interval);
          return;
        }
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const average = sum / buffer.length;

        const card = document.getElementById(`peer-card-${peerId}`);
        if (card) {
          card.classList.toggle('speaking', average > 12);
        }
      }, 120);
    } catch (e) {
      console.warn('Remote audio analyser error:', e);
    }
  }

  renderPeerCard(peerId, username) {
    const grid = document.getElementById('huddle-tiles-grid');
    if (!grid) return;

    let card = document.getElementById(`peer-card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `peer-card-${peerId}`;
      card.className = 'huddle-member-card';

      const initial = (username || 'P').charAt(0).toUpperCase();
      card.innerHTML = `
        <div class="huddle-member-avatar">${escapeHtml(initial)}</div>
        <span class="member-name">${escapeHtml(username)}</span>
        <div class="huddle-speaking-bars">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
        <span class="member-mic-status"><i class="fas fa-microphone text-green"></i></span>
      `;
      grid.appendChild(card);
    }
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (peer.connection) {
        try { peer.connection.close(); } catch (e) {}
      }
      this.peers.delete(peerId);
    }

    const audio = document.getElementById(`peer-audio-${peerId}`);
    if (audio) audio.remove();

    const card = document.getElementById(`peer-card-${peerId}`);
    if (card) card.remove();

    showToast('Participant left huddle');
  }

  updateHuddleStatusText(text) {
    const statusEl = document.getElementById('huddle-active-text');
    if (statusEl) statusEl.textContent = text;
  }

  updateHeaderHuddleButton(inHuddle) {
    const btn = document.getElementById('btn-huddle-toggle');
    if (!btn) return;

    if (inHuddle) {
      btn.classList.add('in-huddle');
      btn.innerHTML = `<i class="fas fa-phone-slash"></i> <span class="hide-mobile">Leave Huddle</span>`;
      btn.title = 'You are in a live huddle. Click to leave.';
    } else {
      btn.classList.remove('in-huddle');
      btn.innerHTML = `<i class="fas fa-headphones"></i> <span class="hide-mobile">Huddle</span>`;
      btn.title = 'Join/Leave Audio & Video Huddle in this room';
    }
  }

  renderHuddleOverlay(room) {
    let overlay = document.getElementById('huddle-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'huddle-overlay';
      overlay.className = 'huddle-bar-overlay';

      const myUsername = (window.state && window.state.user) ? window.state.user.username : 'You';
      const myInitial = myUsername.charAt(0).toUpperCase();

      overlay.innerHTML = `
        <div class="huddle-bar-content">
          <div class="huddle-info">
            <span class="huddle-pulse"></span>
            <strong>#${escapeHtml(room)} Huddle</strong>
            <span id="huddle-active-text">Connecting...</span>
          </div>

          <div id="huddle-tiles-grid" class="huddle-tiles-grid">
            <div id="peer-card-local" class="huddle-member-card local">
              <div class="huddle-member-avatar">${escapeHtml(myInitial)}</div>
              <span class="member-name">${escapeHtml(myUsername)} (You)</span>
              <div class="huddle-speaking-bars">
                <span class="bar"></span>
                <span class="bar"></span>
                <span class="bar"></span>
              </div>
              <span class="member-mic-status"><i class="fas fa-microphone text-green"></i></span>
            </div>
            <video id="huddle-local-video" autoplay muted playsinline class="huddle-peer-tile local" style="display:none;"></video>
          </div>

          <div class="huddle-controls">
            <button id="huddle-btn-mic" class="huddle-btn" title="Toggle Microphone" onclick="window.huddle.toggleMic()">
              <i class="fas fa-microphone"></i>
            </button>
            <button id="huddle-btn-cam" class="huddle-btn off" title="Toggle Camera" onclick="window.huddle.toggleCamera()">
              <i class="fas fa-video-slash"></i>
            </button>
            <button id="huddle-btn-screen" class="huddle-btn" title="Share Screen" onclick="window.huddle.toggleScreenShare()">
              <i class="fas fa-desktop"></i>
            </button>
            <button id="huddle-btn-leave" class="huddle-btn leave" title="Leave Huddle" onclick="window.huddle.leaveHuddle()">
              <i class="fas fa-phone-slash"></i> Leave
            </button>
          </div>
        </div>
      `;

      const workspaceHeader = document.querySelector('.workspace-header');
      if (workspaceHeader && workspaceHeader.nextSibling) {
        workspaceHeader.parentNode.insertBefore(overlay, workspaceHeader.nextSibling);
      } else {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
          messagesContainer.parentNode.insertBefore(overlay, messagesContainer);
        }
      }
    }
  }
}

window.huddle = new HuddleManager();

// Listen to huddle socket signaling events
socket.on('huddleExistingPeers', ({ peers }) => {
  if (peers && Array.isArray(peers)) {
    peers.forEach(p => {
      window.huddle.createPeerConnection(p.id, true, p.username);
    });
  }
});

socket.on('huddlePeerJoined', ({ id, username }) => {
  window.huddle.createPeerConnection(id, false, username);
  showToast(`${username} joined the huddle 🎙️`);
});

socket.on('huddleSignal', ({ senderId, signal, username }) => {
  window.huddle.handleSignal(senderId, signal, username);
});

socket.on('huddlePeerLeft', ({ id }) => {
  window.huddle.removePeer(id);
});

socket.on('huddleStatus', ({ room, activeCount }) => {
  const badge = document.getElementById('huddle-badge-btn');
  if (badge) {
    if (activeCount > 0) {
      badge.innerHTML = `<span class="huddle-dot"></span> Huddle (${activeCount})`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Update header button badge if not in huddle
  const headerBtn = document.getElementById('btn-huddle-toggle');
  if (headerBtn && !window.huddle.isInHuddle) {
    if (activeCount > 0) {
      headerBtn.classList.add('has-active-huddle');
      headerBtn.title = `${activeCount} participant(s) currently in huddle. Click to join.`;
    } else {
      headerBtn.classList.remove('has-active-huddle');
      headerBtn.title = 'Join/Leave Audio & Video Huddle in this room';
    }
  }
});
