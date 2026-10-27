import { Router } from 'express'
import { getMenu } from '../services/menu-service.js'
import { openApiSpec } from '../openapi/spec.js'

export const menuRouter = Router()

menuRouter.get('/menu', (_req, res) => {
  res.json({ data: getMenu() })
})

menuRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec)
})
