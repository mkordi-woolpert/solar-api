/**
 * A bounding box in lat/lng coordinates.
 */
export type LatLngBox = {
  /**
   * The southwest corner of the box.
   */
  sw: google.maps.LatLng;

  /**
   * The northeast corner of the box.
   */
  ne: google.maps.LatLng;
};
  