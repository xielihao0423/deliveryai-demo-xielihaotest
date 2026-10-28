export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: '沸点火锅点单演示 API',
    version: '1.0.0',
    description: '沸点火锅点单演示后端 API，覆盖点餐全流程与拦截事件机制',
  },
  servers: [
    { url: 'http://localhost:3001', description: '本地开发服务器' },
  ],
  paths: {
    '/ping': {
      get: {
        summary: '健康检查',
        description: '返回服务健康状态',
        responses: {
          '200': {
            description: '服务正常',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'pong' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/menu': {
      get: {
        summary: '获取菜单列表',
        description: '返回所有菜品列表（含分类、售罄状态）',
        responses: {
          '200': {
            description: '菜单列表',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        categories: { type: 'array', items: { type: 'string' } },
                        products: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/tables/{tableId}/bind': {
      post: {
        summary: '绑定餐桌',
        description: '绑定指定餐桌号，触发 table.bind 拦截事件',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' }, description: '餐桌号 (A08/B12/C06/D03)' },
        ],
        responses: {
          '200': { description: '绑定成功' },
          '403': { description: '被拦截（无效餐桌号或已被占用）' },
        },
      },
    },
    '/api/tables/{tableId}/orders': {
      post: {
        summary: '提交订单',
        description: '提交订单，触发 order.submit 拦截事件（校验售罄菜品）',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
                  operator: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '订单创建成功' },
          '403': { description: '被拦截（包含售罄菜品）' },
        },
      },
      get: {
        summary: '查询订单列表',
        description: '查询指定餐桌的订单列表及状态',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '订单列表' },
        },
      },
    },
    '/api/orders/{orderId}/stage': {
      patch: {
        summary: '更新订单阶段',
        description: '更新订单下所有 OrderItem 的阶段，触发 order.stage_change 拦截事件',
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  stage: { type: 'string', enum: ['submitted', 'accepted', 'cooking', 'served'] },
                },
                required: ['stage'],
              },
            },
          },
        },
        responses: {
          '200': { description: '阶段更新成功' },
          '403': { description: '被拦截（非法阶段流转）' },
          '404': { description: '订单不存在' },
        },
      },
    },
    '/api/orders/{orderId}/cancel': {
      post: {
        summary: '申请取消订单项',
        description: '申请取消订单中的指定项，触发 order.cancel 拦截事件',
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  itemId: { type: 'string' },
                },
                required: ['itemId'],
              },
            },
          },
        },
        responses: {
          '200': { description: '取消请求已提交' },
          '403': { description: '被拦截（已上菜不可取消）' },
          '404': { description: '订单或订单项不存在' },
        },
      },
    },
    '/api/tables/{tableId}/services': {
      post: {
        summary: '呼叫服务',
        description: '呼叫服务（加汤/饮料/餐具/结账），触发 service.call 拦截事件（30秒限流）',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  serviceType: { type: 'string' },
                },
                required: ['serviceType'],
              },
            },
          },
        },
        responses: {
          '200': { description: '服务请求已创建' },
          '403': { description: '被拦截（30秒内重复呼叫同类服务）' },
        },
      },
    },
    '/api/tables/{tableId}/services/respond': {
      patch: {
        summary: '响应服务请求',
        description: '响应指定餐桌的所有待处理服务请求，触发 service.respond 拦截事件',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '服务请求已响应' },
          '403': { description: '被拦截（无待响应服务）' },
        },
      },
    },
    '/api/tables/{tableId}/checkout': {
      post: {
        summary: '结账支付',
        description: '结账支付，触发 checkout.pay 拦截事件（校验订单和取消请求）',
        parameters: [
          { name: 'tableId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '结账成功' },
          '403': { description: '被拦截（无订单或存在待处理取消请求）' },
        },
      },
    },
    '/api/events': {
      get: {
        summary: '查询事件日志列表',
        description: '查询拦截事件日志列表，支持按 eventType 和 tableId 筛选',
        parameters: [
          { name: 'eventType', in: 'query', schema: { type: 'string' } },
          { name: 'tableId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '事件日志列表' },
        },
      },
    },
    '/api/events/{eventId}': {
      get: {
        summary: '查询单个事件详情',
        description: '根据事件 ID 查询单个拦截事件详情',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '事件详情' },
          '404': { description: '事件不存在' },
        },
      },
    },
    '/api/openapi.json': {
      get: {
        summary: '获取 OpenAPI 3.0 规范文档',
        description: '返回完整的 OpenAPI 3.0 规范 JSON 文档',
        responses: {
          '200': { description: 'OpenAPI 3.0 规范文档' },
        },
      },
    },
  },
  components: {
    schemas: {
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          price: { type: 'number' },
          badge: { type: 'string' },
          soldOut: { type: 'boolean' },
          options: {
            type: 'object',
            properties: {
              portion: { type: 'array', items: { type: 'string' } },
              flavor: { type: 'array', items: { type: 'string' } },
              spicy: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      CartItem: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          productId: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'number' },
          spec: { type: 'string' },
          orderedBy: { type: 'string' },
        },
        required: ['uid', 'productId', 'name', 'price', 'quantity', 'spec', 'orderedBy'],
      },
      OrderItem: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          productId: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'number' },
          spec: { type: 'string' },
          orderedBy: { type: 'string' },
          stage: { type: 'string', enum: ['submitted', 'accepted', 'cooking', 'served'] },
          cancelState: { type: 'string', enum: ['requested', 'approved'] },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tableId: { type: 'string' },
          items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
          createdAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['active', 'cancelled', 'paid'] },
        },
      },
      ServiceRequest: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tableId: { type: 'string' },
          type: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['waiting', 'responded'] },
        },
      },
      InterceptEvent: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          eventType: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          source: { type: 'string' },
          data: { type: 'object' },
          metadata: {
            type: 'object',
            properties: {
              tableId: { type: 'string' },
              operator: { type: 'string' },
              method: { type: 'string' },
              path: { type: 'string' },
            },
          },
        },
      },
      EventLogEntry: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          eventType: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          source: { type: 'string' },
          data: { type: 'object' },
          metadata: { type: 'object' },
          result: { type: 'string', enum: ['passed', 'intercepted'] },
          reason: { type: 'string' },
          responseSnapshot: {},
        },
      },
    },
  },
}
