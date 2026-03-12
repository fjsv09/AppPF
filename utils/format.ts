export function formatMoney(amount: number | string | undefined | null): string {
    const num = Number(amount);
    if (isNaN(num)) return "0";

    // Round to max 2 decimals to avoid floating point artifacts (e.g. 833.333333)
    const rounded = Math.round(num * 100) / 100;
    
    // Split integer and decimal parts
    const parts = rounded.toString().split(".");
    
    // Add commas to integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    return parts.join(".");
}

/**
 * Formats a YYYY-MM-DD string or Date object into a localized date string (DD/MM/YYYY)
 * preventing timezone shifts that happen with new Date(str).
 */
export function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '';
    
    if (date instanceof Date) {
        // Safe conversion for Date objects to local YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${day}/${month}/${year}`;
    }

    // If it's a full ISO string, take only the date part
    const cleanDate = date.includes('T') ? date.split('T')[0] : date;
    
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return cleanDate;
    
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}
