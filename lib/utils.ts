import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea una fecha en zona horaria de Perú (America/Lima)
 */
export function formatDatePeru(date: string | Date, preset: 'full' | 'time' | 'date' | 'dayMonth' | 'dayMonthYear' | 'isoDate' = 'full') {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Lima',
  };

  switch (preset) {
    case 'full':
        return new Intl.DateTimeFormat('es-PE', {
            ...options,
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(d).replace(',', ' ·');
    
    case 'time':
        return new Intl.DateTimeFormat('es-PE', {
            ...options,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(d);

    case 'date':
        return new Intl.DateTimeFormat('es-PE', {
            ...options,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(d);

    case 'dayMonth':
        return new Intl.DateTimeFormat('es-PE', {
            ...options,
            day: 'numeric',
            month: 'short'
        }).format(d);

    case 'dayMonthYear':
        return new Intl.DateTimeFormat('es-PE', {
            ...options,
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(d);

    case 'isoDate':
        return new Intl.DateTimeFormat('en-CA', {
            ...options,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(d);

    default:
        return d.toLocaleString('es-PE', options);
  }
}
