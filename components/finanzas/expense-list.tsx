import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Receipt, Calendar, Tag, CreditCard, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ExpenseListProps {
  expenses: any[]
}

export function ExpenseList({ expenses }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
        <CardContent className="pt-6 text-center py-10">
          <Receipt className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">No se han registrado gastos recientemente.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
      <CardHeader className="border-b border-slate-800/50 bg-slate-900/30">
        <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-purple-400" />
          Gastos Recientes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-950/50">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 font-bold">Fecha</TableHead>
                <TableHead className="text-slate-400 font-bold">Categoría</TableHead>
                <TableHead className="text-slate-400 font-bold">Descripción</TableHead>
                <TableHead className="text-slate-400 font-bold">Cuenta</TableHead>
                <TableHead className="text-slate-400 font-bold text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id} className="border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <TableCell className="text-slate-300 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {format(new Date(expense.created_at), 'dd MMM, yyyy', { locale: es })}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-tighter">
                        {format(new Date(expense.created_at), 'HH:mm', { locale: es })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-500/10 rounded-lg">
                        <Tag className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <span className="text-sm text-slate-200">{expense.categorias_gastos?.nombre || 'General'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-sm text-slate-400 truncate" title={expense.descripcion}>
                      {expense.descripcion || 'Sin descripción'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                       <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                       <span className="text-xs text-slate-400">{expense.cuentas_financieras?.nombre || 'N/A'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-md font-bold text-rose-400">
                      - S/ {parseFloat(expense.monto).toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function History({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}
