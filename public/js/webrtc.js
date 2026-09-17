/**
 * WebRTC Huddle & Screen Sharing Controller
 * Provides peer-to-peer audio, video, and screen sharing directly in channels.
 */

class HuddleManager {
  constructor() {
    this.isInHuddle = false;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // peerId -> { connection, stream, username }
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    this.isMuted = false;
    this.isCamOff = true; // Audio-first huddle by default
    this.isSharingScreen = false;
  }

  async joinHuddle(room) {
    if (this.isInHuddle) return;
    try {
      // 1. Get user media (mic enabled, camera off by default for lightweight huddle)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });

      this.isInHuddle = true;
      this.isMuted = false;
      this.isCamOff = true;

      // Update UI
      this.renderHuddleOverlay(room);

      // Emit join to server
      socket.emit('huddleJoin', { room });
      showToast('Joined channel huddle 🎙️');
    } catch (err) {
      console.error('Failed to access microphone for huddle:', err);
      alert('Could not start huddle: Microphone permission denied or device unavailable.');
    }
  }

  leaveHuddle() {
    if (!this.isInHuddle) return;

    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // Close peer connections
    for (const [id, peer] of this.peers.entries()) {
      if (peer.connection) peer.connection.close();
    }
    this.peers.clear();
    this.isInHuddle = false;

    // Remove UI
    const overlay = document.getElementById('huddle-overlay');
    if (overlay) overlay.remove();

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
    }
  }

  async toggleCamera() {
    try {
      if (this.isCamOff) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.isCamOff = false;

        // Add track to peers
        for (const [id, peer] of this.peers.entries()) {
          peer.connection.addTrack(videoTrack, this.localStream);
        }

        const localVideo = document.getElementById('huddle-local-video');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
          localVideo.style.display = 'block';
        }
      } else {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          this.localStream.removeTrack(videoTrack);
        }
        this.isCamOff = true;
        const localVideo = document.getElementById('huddle-local-video');
        if (localVideo) localVideo.style.display = 'none';
      }

      const btn = document.getElementById('huddle-btn-cam');
      if (btn) {
        btn.innerHTML = this.isCamOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
        btn.classList.toggle('off', this.isCamOff);
      }
    } catch (err) {
      alert('Camera access failed or denied: ' + err.message);
    }
  }

  async toggleScreenShare() {
    try {
      if (!this.isSharingScreen) {
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
      console.error('Screen sharing canceled or failed:', err);
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
  createPeerConnection(peerId, isInitiator = false) {
    const pc = new RTCPeerConnection(this.config);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('huddleSignal', {
          targetId: peerId,
          signal: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      this.handleRemoteStream(peerId, event.streams[0]);
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('huddleSignal', {
            targetId: peerId,
            signal: { sdp: pc.localDescription }
          });
        } catch (e) {
          console.error('Offer error:', e);
        }
      };
    }

    this.peers.set(peerId, { connection: pc, stream: null });
    return pc;
  }

  async handleSignal(senderId, signal) {
    let peer = this.peers.get(senderId);
    if (!peer) {
      const pc = this.createPeerConnection(senderId, false);
      peer = this.peers.get(senderId);
    }

    const pc = peer.connection;

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('huddleSignal', {
          targetId: senderId,
          signal: { sdp: pc.localDescription }
        });
      }
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  }

  handleRemoteStream(peerId, stream) {
    let video = document.getElementById(`peer-video-${peerId}`);
    if (!video) {
      video = document.createElement('video');
      video.id = `peer-video-${peerId}`;
      video.autoplay = true;
      video.playsInline = true;
      video.className = 'huddle-peer-tile';

      const container = document.getElementById('huddle-tiles-grid');
      if (container) container.appendChild(video);
    }
    video.srcObject = stream;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (peer.connection) peer.connection.close();
      this.peers.delete(peerId);
    }
    const tile = document.getElementById(`peer-video-${peerId}`);
    if (tile) tile.remove();
  }

  renderHuddleOverlay(room) {
    let overlay = document.getElementById('huddle-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'huddle-overlay';
      overlay.className = 'huddle-bar-overlay';
      overlay.innerHTML = `
        <div class="huddle-bar-content">
          <div class="huddle-info">
            <span class="huddle-pulse"></span>
            <strong>Huddle in #${room}</strong>
            <span id="huddle-active-text">Connected</span>
          </div>

          <div id="huddle-tiles-grid" class="huddle-tiles-grid">
            <video id="huddle-local-video" autoplay muted playsinline class="huddle-peer-tile local" style="display:none;"></video>
          </div>

          <div class="huddle-controls">
            <button id="huddle-btn-mic" class="huddle-btn" title="Toggle Mic" onclick="window.huddle.toggleMic()">
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
      const messagesContainer = document.getElementById('chat-messages');
      messagesContainer.parentNode.insertBefore(overlay, messagesContainer);
    }
  }
}

window.huddle = new HuddleManager();

// Listen to huddle socket events
socket.on('huddleExistingPeers', ({ peers }) => {
  peers.forEach(p => {
    window.huddle.createPeerConnection(p.id, true);
  });
});

socket.on('huddlePeerJoined', ({ id, username }) => {
  window.huddle.createPeerConnection(id, false);
  showToast(`${username} joined the huddle 🎙️`);
});

socket.on('huddleSignal', ({ senderId, signal }) => {
  window.huddle.handleSignal(senderId, signal);
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
});
