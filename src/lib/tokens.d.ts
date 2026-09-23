export interface PaletaColores {
  bg: string
  surface: string
  surface2: string
  accent: string
  accentAlt: string
  success: string
  danger: string
  warning: string
  text: string
  textDim: string
  brillo2: string
}
type Materiales = { chip: string; panel: string; chrome: string; flotante: string; hoja: string; scrim: string; relleno: string }
type Sombras = { chip: string; panel: string; chrome: string; flotante: string; hoja: string }
export interface Tema {
  colores: PaletaColores
  brillos: [number, number, number]
  materiales: Materiales
  bordesVidrio: { canto: string; perimetro: string }
  sombras: Sombras
}
export declare const temas: { oscuro: Tema; claro: Tema }
export declare const colores: PaletaColores
export declare const desenfoques: { chip: string; panel: string; chrome: string; flotante: string; hoja: string }
export declare const fuentes: { principal: string[]; mono: string[] }
export type PuntosBezier = [number, number, number, number]
export declare const curvasBezier: { salida: PuntosBezier; entrada: PuntosBezier; estandar: PuntosBezier }
export declare const curvas: { salida: string; entrada: string; estandar: string }
export declare const duraciones: { presion: string; rapida: string; normal: string; lenta: string }
export declare const radios: { chip: string; control: string; panel: string; tarjeta: string; hoja: string }
export declare const tracking: { display: string; titulo: string; base: string; micro: string }
export declare const paletaDatos: string[]
