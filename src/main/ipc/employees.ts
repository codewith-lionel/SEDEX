import { z } from 'zod'
import { IPC } from '../../shared/constants'
import { employeesImportSchema } from '../../shared/schemas'
import {
  addEmployee,
  countEmployees,
  deleteEmployee,
  importEmployees,
  listEmployees,
  updateEmployee,
} from '../services/database/repositories/employees'
import { handle } from './handler'

const employeeInputSchema = z.object({
  name: z.string().min(1, 'Employee name is required').max(200),
  code: z.string().max(100).nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  designation: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export function registerEmployeeIpc(): void {
  handle(IPC.employeesList, z.object({ search: z.string().max(200).optional() }), (q) => ({
    employees: listEmployees(q.search),
    count: countEmployees(),
  }))

  handle(IPC.employeesAdd, employeeInputSchema, (input) => addEmployee(input))

  handle(
    IPC.employeesUpdate,
    z.object({ id: z.string().min(1) }).merge(employeeInputSchema),
    (input) => updateEmployee(input.id, input),
  )

  handle(IPC.employeesDelete, z.object({ id: z.string().min(1) }), ({ id }) => {
    deleteEmployee(id)
    return { deleted: true }
  })

  handle(IPC.employeesImport, employeesImportSchema, ({ columnMapping, rows }) => {
    // Map generic file rows onto employee columns using the user's mapping.
    const mappedRows: Record<string, string>[] = []
    for (const row of rows) {
      const out: Record<string, string> = {
        name: '',
        code: '',
        department: '',
        designation: '',
        notes: '',
      }
      for (const [header, target] of Object.entries(columnMapping)) {
        const value = (row[header] ?? '').trim()
        if (value) out[target] = value
      }
      if (out.name) mappedRows.push(out)
    }
    return importEmployees(mappedRows)
  })
}
