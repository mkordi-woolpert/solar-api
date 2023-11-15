//@ts-ignore
import * as GeoTIFF from "geotiff.js/dist/geotiff.bundle.min.js";
import { DataLayers } from "../types/DataLayers";
import { getDataLayers } from "./solar-api";

async function downloadTiff(apiKey: string, baseUrl: string | URL): Promise<ArrayBuffer> {
  const url = new URL(baseUrl);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);

  if (!response.ok)
    throw new Error(`Google Maps Solar API Error: ${response.status} ${response.statusText}`);

  return response.arrayBuffer();
};

async function createCanvasFromDataLayerUrl(apiKey: string, url: string, 
  draw: (context: CanvasRenderingContext2D, tiffData: any, row: number, column: number, value: number)=> void) {
  const tiffImageBuffer = await downloadTiff(apiKey, url);
  const tiff = await GeoTIFF.fromArrayBuffer(tiffImageBuffer);
  const tiffImage = await tiff.getImage();
  const tiffData = await tiffImage.readRasters();

  console.log(tiffData);

  const canvas = document.createElement("canvas");

  canvas.width = tiffData.width;
  canvas.height = tiffData.height;

  const context = canvas.getContext("2d") as CanvasRenderingContext2D;

  for (let row = 0; row < tiffData.height; row += 1)
    for (let column = 0; column < tiffData.width; column +=1) {
      const index = (row * tiffData.width) + column;
      const value = tiffData[0][index];
      draw(context, tiffData, row, column, value);
    }

  return canvas;

}

async function getFluxDataLayer(apiKey: string, dataLayers: DataLayers) {
  var maxFlux = 0;

  return await  createCanvasFromDataLayerUrl(apiKey, dataLayers.annualFluxUrl!, (context, tiffData, row, column, value) => {
    if (value === -9999)
        return;

        // calculate the max only once for all pixels
        if (maxFlux == 0) {
          maxFlux = tiffData[0].reduce((unit: number, currentUnit: number) => (unit > currentUnit) ? (unit) : (currentUnit), 0);
        }

      context.fillStyle = `hsl(40 100% ${((value / maxFlux) * 100)}%)`;
      context.fillRect(column, row, 1, 1);
  });
};

async function getMaskDataLayer(apiKey: string, dataLayers: DataLayers) {
  return createCanvasFromDataLayerUrl(apiKey, dataLayers.maskUrl!, (context, _, row, column, value) => {
    if(value) {
      context.fillRect(column, row, 1, 1);
    }
  });
};

function mergeCanvasToContext(context: CanvasRenderingContext2D,
  operation: GlobalCompositeOperation,
  canvas: HTMLCanvasElement, size: number) {
  if (operation != null) {
    context.globalCompositeOperation = operation;
  }

  context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, size, size);
}


export default class SolarDataLayerOverlay {
  static create(bounds: google.maps.LatLngBounds, image: HTMLCanvasElement) {
    return new (class extends google.maps.OverlayView {
      readonly bounds: google.maps.LatLngBounds;
      readonly image: HTMLCanvasElement;
    
      element?: HTMLDivElement;
    
      constructor(bounds: google.maps.LatLngBounds, image: HTMLCanvasElement) {
        super();
    
        this.bounds = bounds;
        this.image = image;
      };
    
      onAdd() {
        this.element = document.createElement("div");
        this.element.style.borderStyle = "none";
        this.element.style.borderWidth = "0px";
        this.element.style.position = "absolute";
    
        this.image.style.width = "100%";
        this.image.style.height = "100%";
        this.image.style.position = "absolute";
        this.element.append(this.image);
    
        const panes = this.getPanes();
    
        panes?.overlayLayer.appendChild(this.element);
      };
    
      draw() {
        if(this.element) {
          const overlayProjection = this.getProjection();
    
          const southWest = overlayProjection.fromLatLngToDivPixel(this.bounds.getSouthWest());
          const northEast = overlayProjection.fromLatLngToDivPixel(this.bounds.getNorthEast());
   
          if(!southWest || !northEast)
            return;

          this.element.style.left = southWest.x + "px";
          this.element.style.top = northEast.y + "px";
          this.element.style.width = northEast.x - southWest.x + "px";
          this.element.style.height = southWest.y - northEast.y + "px";
        }
      };
    
      onRemove() {
        if(this.element) {
          this.element.parentNode?.removeChild(this.element);
    
          delete this.element;
        }
      };
    })(bounds, image);
  };

  static async getDataLayersCanvas(apiKey: string, location:google.maps.LatLng, radius: number ) {

    const bounds = new google.maps.LatLngBounds();
    for(var i=0;i<4;i++) {
      bounds.extend(google.maps.geometry.spherical.computeOffset(location, radius, i * 90));
    }

    const dataLayers = await getDataLayers(apiKey, {
      location: location,
      radiusMeters: radius,
      view: "IMAGERY_AND_ANNUAL_FLUX_LAYERS"
    });

    const canvas = document.createElement("canvas");
  
    const size = 2000;
    canvas.width = size;
    canvas.height = size;
  
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
  
    const layers = await Promise.all([
      getFluxDataLayer(apiKey, dataLayers),
      getMaskDataLayer(apiKey, dataLayers),
    ]);
  
  
    mergeCanvasToContext(context, "source-over", layers[0], size);
    mergeCanvasToContext(context, "destination-in", layers[1], size);
    return SolarDataLayerOverlay.create(bounds, canvas);
  };
};
