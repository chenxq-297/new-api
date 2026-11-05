/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { z } from 'zod'

export const creationFormSchema = z.object({
  tokenId: z.string().regex(/^\d+$/, 'Choose an API key.'),
  model: z.string().min(1, 'Choose a model.'),
  prompt: z
    .string()
    .trim()
    .min(1, 'Describe what you want to create.')
    .max(32_000, 'Keep the prompt under 32,000 characters.'),
  size: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\d{2,5}x\d{2,5}$/.test(value),
      'Use a size such as 1024x1024.'
    ),
  seconds: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[1-9]\d{0,3}$/.test(value),
      'Enter a whole number of seconds.'
    ),
})

export type CreationFormValues = z.infer<typeof creationFormSchema>
