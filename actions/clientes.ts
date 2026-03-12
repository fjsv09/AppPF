
/**
 * Acciones para la gestión de clientes
 */

export async function updateClientAction(data: any) {
  try {
    const response = await fetch('/api/clientes', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Error al actualizar el cliente')
    }

    return result
  } catch (error: any) {
    console.error('Error in updateClientAction:', error)
    throw error
  }
}
