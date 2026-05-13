// Convierte latitud y longitud a un objeto MySQL POINT (formato para consultas)
const createPoint = (lat, lng) => {
    if (lat === undefined || lng === undefined) return null;
    return `POINT(${parseFloat(lng)} ${parseFloat(lat)})`; // NOTA: POINT(lng lat)
};

// Extrae lat/lng de un POINT devuelto por MySQL (formato binario o texto)
// Asumiendo que usamos ST_AsText para obtener 'POINT(lng lat)'
const parsePoint = (pointText) => {
    if (!pointText) return null;
    const match = pointText.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    return null;
};

module.exports = { createPoint, parsePoint };