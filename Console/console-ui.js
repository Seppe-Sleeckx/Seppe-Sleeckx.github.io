function startConsoleUI() {
  const overlay = document.getElementById("startup-overlay");
  const logo = document.getElementById("startup-logo");
  const mainUI = document.getElementById("main-ui");

  // Ensure starting state
  overlay.style.display = "flex";
  mainUI.style.display = "none";
  logo.classList.remove("active");
  overlay.classList.remove("hidden");

  // Step 1: Light up the logo
  setTimeout(() => {
    logo.classList.add("active");
  }, 100); // small delay to trigger CSS transition

  // Step 2: Wait 2 seconds, fade out overlay
  setTimeout(() => {
    overlay.classList.add("hidden");

    // Step 3: After fade-out, show main UI (1s = match CSS fade-out duration)
    setTimeout(() => {
      overlay.style.display = "none";
      mainUI.style.display = "block";
    }, 1000);
  }, 2000);
}

// Make function accessible externally
window.startConsoleUI = startConsoleUI;

// --------------------
// Carousel logic
// --------------------
(function () {
  const track = document.querySelector(".carousel-track");
  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");

  if (!track || !btnLeft || !btnRight) return;

  let index = 0;

  //Generate corners for cards
  document.querySelectorAll(".card").forEach((card) => {
    ["tl", "tr", "bl", "br"].forEach((pos) => {
      const corner = document.createElement("span");
      corner.className = `corner corner-${pos}`;
      card.appendChild(corner);
    });
  });

  function moveCarousel(direction) {
    const cardWidth = track.children[0].offsetWidth + 20;
    const visibleCards = Math.floor(
      document.querySelector(".carousel-container").offsetWidth / cardWidth
    );
    const maxIndex = Math.max(track.children.length - visibleCards, 0);

    if (direction === "right" && index < maxIndex) {
      index++;
    } else if (direction === "left" && index > 0) {
      index--;
    }

    track.style.transform = `translateX(${-cardWidth * index}px)`;
    updateArrowVisibility();
    setActiveCard();
  }

  function updateArrowVisibility() {
    const cardWidth = track.children[0].offsetWidth + 20;
    const visibleCards = Math.floor(
      document.querySelector(".carousel-container").offsetWidth / cardWidth
    );
    const maxIndex = Math.max(track.children.length - visibleCards, 0);

    btnLeft.disabled = index <= 0;
    btnRight.disabled = index >= maxIndex;
    btnLeft.style.opacity = btnLeft.disabled ? "0.4" : "1";
    btnRight.style.opacity = btnRight.disabled ? "0.4" : "1";
  }

  function setActiveCard() {
    document.querySelectorAll(".card").forEach((c, i) => {
      c.classList.toggle("active", i === index);
    });
  }
  //-- events --
  btnRight.addEventListener("click", () => moveCarousel("right"));
  btnLeft.addEventListener("click", () => moveCarousel("left"));
  window.addEventListener("resize", updateArrowVisibility);

  let overlayOpen = false;
  //expose control functions globally
  window.carouselControls = {
    moveLeft: () => moveCarousel("left"),
    moveRight: () => moveCarousel("right"),
    activateActiveCard: () => {
      if (overlayOpen) return; //prevent double opening
      const activeCard = document.querySelector('.card.active');
      if (!activeCard) return;

      activeCard.click();
      overlayOpen = true;
    },
    overlayClosed: () => {
      overlayOpen = false;
    },
  };

  //run at start
  updateArrowVisibility();
  setActiveCard();
})();


//External message listener
window.addEventListener("message", (event) => {
  if (event.data?.action === "startConsoleUI") {
    startConsoleUI();
  }
});


//Clock
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${hours}:${minutes}`;
}
updateClock();
setInterval(updateClock, 1000);

//Card selection
const cards = document.querySelectorAll('.card');
const overlay = document.getElementById('iframe-overlay');
const frame = document.getElementById('content-frame');

cards.forEach(card => {
  card.addEventListener('click', () => {
    const link = card.getAttribute('data-link');
    if (!link) return;

    // show overlay
    overlay.style.display = 'flex';
    frame.src = link;

    // Wait a frame so the browser registers the style change
    requestAnimationFrame(() => {
      frame.style.transform = 'scale(1)';
      frame.style.opacity = '1';
    });
  });
});

//Handle button close click
window.addEventListener('message', (event) => {
  if (event.data.action === 'closeOverlay') {
    // Hide the overlay and reset iframe
    overlay.style.display = 'none';
    frame.style.transform = 'scale(0.95)';
    frame.style.opacity = '0';
    frame.src = '';
  }

  window.carouselControls.overlayClosed();
});