var map = new mapboxgl.Map({
  accessToken: 'pk.eyJ1Ijoic3RhbWVuIiwiYSI6IlpkZEtuS1EifQ.jiH_c9ShtBwtqH9RdG40mw',
  container: 'map',
  style: 'mapbox://styles/stamen/cknpiguav27ds17tc38fn499t',
  center: [-74, 40.7],
  zoom: 10
});

let currentArea;

let clipPath;
let pointsExtent = [
  [+Infinity, +Infinity],
  [-Infinity, -Infinity],
];

const dpr = window.devicePixelRatio || 1;

const captureButton = document.querySelector('.capture-button');
const clearButton = document.querySelector('.clear-button');
const rotateButton = document.querySelector('.rotate-button');
const opacitySlider = document.querySelector('.opacity-slider');

// A canvas that holds the entire map image, everything outside of
// the drawn region is transparent
const maskCanvas = document.querySelector('.mask-canvas');

// A canvas that holds the masked area but clipped down to a
// smaller area
const clippedCanvas = document.querySelector('.clipped-canvas');

// A canvas that holds any modifications such as rotation
const modifyCanvas = document.querySelector('.modify-canvas');

// The destination canvas which is showed on the map
const destCanvas = document.querySelector('.dest-canvas');

function zoomRatio(lat, zoom) {
  return ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom));
}

map.on('move', e => {
  const canvasSource = map.getSource('canvas-source');
  if (!canvasSource) return;

  let currentMetersPerPx = zoomRatio(map.getCenter().lat, map.getZoom());
  let scale = currentArea.metersPerPx / currentMetersPerPx;

  canvasSource.setCoordinates(getCanvasCoordinates(currentArea, scale));
});

let rotating = false;

map.on('mousemove', e => {
  if (rotating) {
    const mouseX = e.originalEvent.layerX;
    const mouseY = (e.originalEvent.target.height - e.originalEvent.layerY);
    const mapCenter = map.project(map.getCenter());
    const dx = mouseX - mapCenter.x;
    const dy = mouseY - mapCenter.y;

    const ctx = getContext(modifyCanvas, currentArea.canvasWidth / dpr, currentArea.canvasHeight / dpr, dpr);

    ctx.save();
    ctx.translate(currentArea.canvasWidth / 2, currentArea.canvasHeight / 2);
    ctx.rotate(-Math.atan2(dy, dx));


    ctx.drawImage(clippedCanvas,
      0, 0, currentArea.canvasWidth, currentArea.canvasHeight,
      -currentArea.canvasWidth / 2, -currentArea.canvasHeight / 2, currentArea.canvasWidth, currentArea.canvasHeight);

    ctx.restore();

    const destCtx = getContext(destCanvas, currentArea.canvasWidth / dpr, currentArea.canvasHeight / dpr, dpr);
    destCtx.drawImage(modifyCanvas, 0, 0);
  }
})

map.on('click', e => {
  if (rotating) {
    rotating = false;
  }
})

const draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: {
    polygon: true,
    trash: true
  },
  defaultMode: 'draw_polygon'
});
map.addControl(draw);

map.on('draw.create', updateShape);
map.on('draw.update', updateShape);

function getContext(canvas, width, height, scale = 1) {
  canvas.width = width * scale;
  canvas.height = height * scale;

  canvas.style.width = width / scale + 'px';
  canvas.style.height = height / scale + 'px';

  return canvas.getContext('2d');
}

function updateShape() {
  const shapeCoordinates = draw.getAll().features[0].geometry.coordinates[0];
  const shapePoints = shapeCoordinates.map(c => {
    const p = map.project(c);

    // Account for pixel density
    return {
      x: dpr * Math.round(p.x),
      y: dpr * Math.round(p.y)
    }
  });

  pointsExtent = [
    [+Infinity, +Infinity],
    [-Infinity, -Infinity],
  ];

  shapePoints.forEach(({x, y}) => {
    if (x < pointsExtent[0][0]) {
      pointsExtent[0][0] = x;
    }
    if (x > pointsExtent[1][0]) {
      pointsExtent[1][0] = x;
    }
    if (y < pointsExtent[0][1]) {
      pointsExtent[0][1] = y;
    }
    if (y > pointsExtent[1][1]) {
      pointsExtent[1][1] = y;
    }
  });

  clipPath = new Path2D();
  clipPath.moveTo(shapePoints[0].x, shapePoints[0].y);
  shapePoints.slice(1, -1).forEach(p => clipPath.lineTo(p.x, p.y));
  clipPath.closePath();

  captureButton.removeAttribute('disabled');
}

function getCanvasCoordinates(region, scale = 1) {
  let { x, y } = map.project(map.getCenter());
  let widthOffset = (region.canvasWidth * scale / dpr) / 2;
  let heightOffset = (region.canvasHeight * scale / dpr) / 2;

  let points = [
    [x - widthOffset, y - heightOffset],
    [x + widthOffset, y - heightOffset],
    [x + widthOffset, y + heightOffset],
    [x - widthOffset, y + heightOffset]
  ];

  return points
    .map(p => {
      const latlng = map.unproject(p);
      return [latlng.lng, latlng.lat];
    });
}

/*
 * Get map canvas with rendered map on it.
 *
 * This is made slightly tricky because the canvas is cleared after renders.
 */
async function getMapCanvas(map) {
  return new Promise((resolve, reject) => {
    map.once("render", () => {
      resolve(map.getCanvas());
    });
    map.setBearing(map.getBearing());
  });
}

function clipMapImage(mapCanvas, srcWidth, srcHeight, region) {
  const intermediateContext = getContext(maskCanvas, srcWidth, srcHeight, dpr);
  const lineWidth = 5;

  intermediateContext.strokeStyle = '#fc03fc';
  intermediateContext.lineWidth = lineWidth;
  intermediateContext.stroke(region.clipPath);
  intermediateContext.clip(region.clipPath);
  intermediateContext.drawImage(mapCanvas, 0, 0);

  const clippedCanvasCtx = getContext(clippedCanvas, region.canvasWidth / dpr, region.canvasHeight / dpr, dpr);

  let x = (region.canvasWidth - region.areaWidth) / 2;
  let y = (region.canvasHeight - region.areaHeight) / 2;

  clippedCanvasCtx.drawImage(maskCanvas,
    pointsExtent[0][0] - lineWidth,
    pointsExtent[0][1] - lineWidth,
    region.areaWidth * dpr + lineWidth * 2,
    region.areaHeight * dpr + lineWidth * 2,
    x,
    y,
    region.areaWidth * dpr + lineWidth * 2,
    region.areaHeight * dpr + lineWidth * 2
  );

  const destCtx = getContext(destCanvas, region.canvasWidth / dpr, region.canvasHeight / dpr, dpr);
  destCtx.drawImage(clippedCanvas, 0, 0);
}

captureButton.addEventListener('click', () => {
  draw.deleteAll();

  captureButton.style.display = 'none';
  clearButton.style.display = 'block';
  // rotateButton.style.display = 'block';

  // We use a timeout to wait for drawn polygon to be removed
  setTimeout(async () => {
    const mapboxCanvas = document.querySelector('.mapboxgl-canvas');

    const width = pointsExtent[1][0] - pointsExtent[0][0];
    const height = pointsExtent[1][1] - pointsExtent[0][1];
    const areaDimension = Math.max(width, height) * 1.5;

    currentArea = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      areaWidth: width,
      areaHeight: height,
      canvasWidth: areaDimension,
      canvasHeight: areaDimension,
      metersPerPx: zoomRatio(map.getCenter().lat, map.getZoom()),
      clipPath: clipPath
    };

    const mapCanvas = await getMapCanvas(map);
    clipMapImage(mapCanvas, mapboxCanvas.width, mapboxCanvas.height, currentArea);

    if (!map.getSource('canvas-source')) {
      map.addSource('canvas-source', {
        type: 'canvas',
        canvas: 'dest-canvas',
        coordinates: getCanvasCoordinates(currentArea),
        animate: true,
      });

      map.addLayer({
        id: 'canvas-layer',
        type: 'raster',
        source: 'canvas-source',
        paint: {
          'raster-fade-duration': 0
        }
      });
    }
  }, 200);
});

clearButton.addEventListener('click', () => {
  captureButton.style.display = 'block';
  captureButton.setAttribute('disabled', 'true');
  clearButton.style.display = 'none';
  rotateButton.style.display = 'none';

  map.removeLayer('canvas-layer');
  map.removeSource('canvas-source');
});

rotateButton.addEventListener('click', () => {
  rotating = true;
});

opacitySlider.addEventListener('change', () => {
  map.setPaintProperty('canvas-layer', 'raster-opacity', +opacitySlider.value);
});
