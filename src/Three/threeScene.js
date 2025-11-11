import * as THREE from 'https://esm.sh/three@0.160.0';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'https://esm.sh/three@0.160.0/examples/jsm/renderers/CSS3DRenderer.js';


const CONSOLE_MODEL_PATH = "./assets/Console/Console.gltf";
let consoleIframe = null;

export function createThreeScene() {
  // ---scene setup---
  const scene = new THREE.Scene();
  const WORLD_WIDTH = 3.4;
  const WORLD_HEIGHT = 2.1;

  //WebGL Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const container = document.querySelector(".scene-container");
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // CSS3D renderer
  const cssRenderer = new CSS3DRenderer();
  renderer.setSize(container.clientWidth, container.clientHeight);
  cssRenderer.domElement.style.position = "absolute";
  cssRenderer.domElement.style.pointerEvents = 'auto';
  container.appendChild(cssRenderer.domElement);

  //Camera (top-down orthographic)
  const camera = new THREE.OrthographicCamera(
    -WORLD_WIDTH / 2,  // left
    WORLD_WIDTH / 2,   // right
    WORLD_HEIGHT / 2,  // top
    -WORLD_HEIGHT / 2, // bottom
    0.1,
    1000
  );

  // Top-down view
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 0, 0);

  //Resize to fit screen (max size)
  function resizeRenderer() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    cssRenderer.setSize(width, height);

    const aspect = width / height;
    const worldAspect = WORLD_WIDTH / WORLD_HEIGHT;

    let cameraWidth, cameraHeight;

    if (aspect >= worldAspect) {
      // Window is wider than world -> limit by height
      cameraHeight = WORLD_HEIGHT / 2;
      cameraWidth = cameraHeight * aspect;
    } else {
      // Window is taller -> limit by width
      cameraWidth = WORLD_WIDTH / 2;
      cameraHeight = cameraWidth / aspect;
    }

    camera.left = -cameraWidth;
    camera.right = cameraWidth;
    camera.top = cameraHeight;
    camera.bottom = -cameraHeight;

    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();

  
  let lastPixelRatio = window.devicePixelRatio;
  function handleZoomChange() {
    if (window.devicePixelRatio !== lastPixelRatio) {
      lastPixelRatio = window.devicePixelRatio;
      resizeRenderer(); // re-size both renderers
    }
  }
  window.addEventListener("resize", handleZoomChange); //Mostly important for chrome as this is not an issue for firefox

  //Lighting
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(2, 4, 5);
  scene.add(light);

  // ---Model + buttons + Dpad---
  const loader = new GLTFLoader();
  //Buttons
  const buttonMeshes = [];
  const buttonOriginalPositions = new Map();
  const buttonTargets = new Map(); //target Y positions for animation
  //Dpad
  let dpadMesh = null;
  let dpadTargetRotation = { x: 0, z: 0 };
  let dpadOriginalRotation = { x: 0, z: 0 };
  let dpadTargetPos;
  let dpadOriginalPos;
  let dpadOriginalQuat = null;
  let dpadTargetQuat = null;
  let activeButton = null;
  //Joystick
  let joystickMesh = null;
  let joystickOriginalPos;
  let joystickTargetPos;
  const joystickMaxRadius = 0.1;
  let isDraggingJoystick = false;
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); //XZ plane

  loader.load(CONSOLE_MODEL_PATH, (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse((child) => {
      if (child.isMesh) {
        // --- Console Screen ---
        if (child.name === "Console_Screen") {
          console.log("Console screen world size:", child.scale.x, child.scale.y);

          child.material.visible = false;

          const iframe = document.createElement('iframe');
          iframe.src = "Console/console-ui.html";
          iframe.style.transformOrigin = "center center";
          iframe.style.width = "800px";
          iframe.style.height = "600px";
          iframe.style.border = "0";
          iframe.style.pointerEvents = "auto";

          const cssObject = new CSS3DObject(iframe);

          // Position and rotation
          child.updateMatrixWorld(true);
          cssObject.position.copy(child.getWorldPosition(new THREE.Vector3()));

          const q = new THREE.Quaternion();
          child.getWorldQuaternion(q);
          cssObject.quaternion.copy(q);


          const localBBox = child.geometry.boundingBox;
          const localSize = new THREE.Vector3();
          localBBox.getSize(localSize);

          const meshWidth = localSize.x;
          const meshHeight = localSize.z;
          const iframeWidth = 800;
          const iframeHeight = 600;

          const scaleX = meshWidth / iframeWidth;
          const scaleY = meshHeight * 16.66; //TEMP fix
          cssObject.scale.set(scaleX, scaleY, 1);

          scene.add(cssObject);
          consoleIframe = iframe;
        }

        //-- Buttons --
        if (child.name.startsWith("Button")) {
          buttonMeshes.push(child);
          buttonOriginalPositions.set(child.name, child.position.clone());
          buttonTargets.set(child.name, child.position.y);
        }

        //-- D-Pad --
        if (child.name == "D-Pad") {
          dpadMesh = child;
          dpadOriginalRotation = { x: dpadMesh.rotation.x, z: dpadMesh.rotation.z };
          dpadTargetRotation = { ...dpadOriginalRotation };

          dpadOriginalQuat = dpadMesh.quaternion.clone();
          dpadTargetQuat = dpadMesh.quaternion.clone();
          dpadOriginalPos = dpadMesh.position.clone();
          dpadTargetPos = dpadOriginalPos.y;
        }

        //-- Joystick --
        if (child.name == "Joystick") {
          joystickMesh = child;
          joystickOriginalPos = joystickMesh.position.clone();
          joystickTargetPos = joystickMesh.position.clone();
        }
      }
    });
  });

  // ---Input handling---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let lastJoystickMoveTime = 0;
  const joystickCooldown = 500; // milliseconds

  function getMouseCoords(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  window.addEventListener("mousedown", (event) => {
    getMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);

    buttonMeshes.forEach(btn => btn.updateMatrixWorld(true));//Update world matrices if transformed

    const buttonIntersects = raycaster.intersectObjects(buttonMeshes, true);
    if (buttonIntersects.length > 0) {
      const button = buttonIntersects[0].object;
      activeButton = button;
      pressButton(button);
      handleButtonClick(button.name, true);
      return;
    }

    const dpadIntersection = raycaster.intersectObjects([dpadMesh], true);
    if (dpadIntersection.length > 0) {
      handleDpadClick(dpadIntersection[0].point, dpadMesh)
    }

    const joystickIntersection = raycaster.intersectObjects([joystickMesh], true);
    if (joystickIntersection.length > 0) {
      isDraggingJoystick = true;
    }
  });

  window.addEventListener("mouseup", () => {
    if (activeButton) {
      releaseButton(activeButton);
      handleButtonClick(activeButton.name, false);
      activeButton = null;
    }

    if (dpadMesh) {
      dpadTargetQuat = dpadOriginalQuat.clone();
      dpadTargetRotation = { ...dpadOriginalRotation };
      dpadTargetPos = dpadOriginalPos.y;
    }

    if (isDraggingJoystick) {
      isDraggingJoystick = false;
    }
  });

  window.addEventListener("mousemove", (event) => {
    if (!isDraggingJoystick) return;

    getMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);

    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersection);

    if (intersection) {
      const offset = new THREE.Vector3()
        .subVectors(intersection, joystickOriginalPos)
        .setY(0);

      //clamp to circular bound
      if (offset.length() > joystickMaxRadius) {
        offset.setLength(joystickMaxRadius);
        const now = performance.now();
        if (now - lastJoystickMoveTime >= joystickCooldown) {
          const x = offset.x;
          const z = offset.z;

          let direction = null;
          if (Math.abs(x) > Math.abs(z)) {
            direction = x > 0 ? 'joystick_right' : 'joystick_left';
          } else {
            direction = z > 0 ? 'joystick_up' : 'joystick_down';
          }

          handleButtonClick(direction, true);

          //udpate time
          lastJoystickMoveTime = now;
        }
      }

      joystickMesh.position.copy(joystickOriginalPos).add(offset);
    }
  });

  // ---Button animation helpers---
  function pressButton(button) {
    const original = buttonOriginalPositions.get(button.name);
    if (original) {
      buttonTargets.set(button.name, original.y - 0.03); //3cm down
    }
  }

  function releaseButton(button) {
    const original = buttonOriginalPositions.get(button.name);
    if (original) {
      buttonTargets.set(button.name, original.y); //back to original pos
    }
  }

  // ---Dpad animation helpers---
  function handleDpadClick(clickPoint, dpad) {
    //transform click point to dpad local space
    const localPoint = dpad.worldToLocal(clickPoint.clone());

    const dirX = localPoint.x;
    const dirY = localPoint.z; //we use z because dpad faces upwards

    const threshold = 0; //how far along our axis
    const tiltAmount = 0.1; //radians

    //Set rotation
    if (Math.abs(dirX) > Math.abs(dirY)) {
      // Left / Right
      if (dirX > threshold) { // Right
        dpadTargetRotation = { x: dpadOriginalRotation.x, z: dpadOriginalRotation.z - tiltAmount };
        handleButtonClick("dpad_right", true);
      } else { // Left 
        dpadTargetRotation = { x: dpadOriginalRotation.x, z: dpadOriginalRotation.z + tiltAmount };
        handleButtonClick("dpad_left", true);
      }
    } else {
      // Up / Down
      if (dirY > threshold) { // Up
        dpadTargetRotation = { x: dpadOriginalRotation.x + tiltAmount, z: dpadOriginalRotation.z };
        handleButtonClick("dpad_up", true);
      } else { // Down
        dpadTargetRotation = { x: dpadOriginalRotation.x - tiltAmount, z: dpadOriginalRotation.z };
        handleButtonClick("dpad_down", true);
      }
    }

    const targetEuler = new THREE.Euler(
      dpadTargetRotation.x,
      0,
      dpadTargetRotation.z,
      "XYZ"
    );
    dpadTargetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

    //Position
    dpadTargetPos = dpadOriginalPos.y - 0.05;
  }

  // ---animation loop---
  function animate() {
    requestAnimationFrame(animate);

    //smoothly move buttons toward their target Y
    buttonMeshes.forEach((btn) => {
      const targetY = buttonTargets.get(btn.name);
      if (targetY !== undefined) {
        btn.position.y += (targetY - btn.position.y) * 0.6;
      }
    });

    //smoothly move dpad toward target rotation
    if (dpadMesh) {
      dpadMesh.quaternion.slerp(dpadTargetQuat, 0.25);
      if (dpadTargetPos !== undefined) {
        dpadMesh.position.y += (dpadTargetPos - dpadMesh.position.y) * 0.6;
      }
    }

    if (joystickMesh) {
      if (!isDraggingJoystick) {
        joystickMesh.position.x += (joystickOriginalPos.x - joystickMesh.position.x) * 0.2;
        joystickMesh.position.z += (joystickOriginalPos.z - joystickMesh.position.z) * 0.2;
      }
    }

    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);
  }
  animate();
}

//---input mapping---
function handleButtonClick(buttonName, isDown) {
  switch (buttonName) {
    case "Button_A":
      if (isDown)
        consoleIframe.contentWindow.carouselControls?.activateActiveCard();
      break;
    case "Button_B":
      if (isDown)
        consoleIframe.contentWindow.postMessage({ action: 'closeOverlay' }, '*');
      break;
    case "Button_Home":
      if (isDown)
        consoleIframe.contentWindow.postMessage({ action: 'closeOverlay' }, '*'); //temp, change functionality later
      break;
    case "Button_Start":
      if (isDown)
        consoleIframe.contentWindow.postMessage({ action: 'startConsoleUI' }, '*');
      break;
    case "dpad_left":
      consoleIframe.contentWindow.carouselControls?.moveLeft();
      break;
    case "dpad_right":
      consoleIframe.contentWindow.carouselControls?.moveRight();
      break;
    case "joystick_left":
      consoleIframe.contentWindow.carouselControls?.moveLeft();
      break;
    case "joystick_right":
      consoleIframe.contentWindow.carouselControls?.moveRight();
      break;

    default:
      console.log("Clicked:", buttonName);
  }
}

//iframe.contentWindow.startConsoleUI(); Trigger Startup console
