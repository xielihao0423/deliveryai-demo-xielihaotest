import type { Product } from '../types.js'

export const categories = [
  'menu.cat.recommend',
  'menu.cat.broth',
  'menu.cat.meat',
  'menu.cat.seafood',
  'menu.cat.veggie',
  'menu.cat.staple',
]

export const products: Product[] = [
  {
    id: 'p1', name: 'menu.p1.name', category: 'menu.cat.broth', price: 68,
    description: 'menu.p1.desc', badge: 'menu.badge.popular', soldOut: false,
    options: { flavor: ['menu.option.tomato_beef', 'menu.option.mushroom_beef'], spicy: ['menu.option.mild', 'menu.option.medium', 'menu.option.heavy', 'menu.option.super_spicy'] },
  },
  {
    id: 'p2', name: 'menu.p2.name', category: 'menu.cat.broth', price: 59,
    description: 'menu.p2.desc', badge: 'menu.badge.signature', soldOut: false,
    options: { spicy: ['menu.option.mild', 'menu.option.medium', 'menu.option.heavy', 'menu.option.super_spicy'] },
  },
  {
    id: 'p3', name: 'menu.p3.name', category: 'menu.cat.meat', price: 42,
    description: 'menu.p3.desc', badge: 'menu.badge.chef', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'], flavor: ['menu.option.original', 'menu.option.spicy_marinate'] },
  },
  {
    id: 'p4', name: 'menu.p4.name', category: 'menu.cat.meat', price: 48,
    description: 'menu.p4.desc', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p5', name: 'menu.p5.name', category: 'menu.cat.seafood', price: 39,
    description: 'menu.p5.desc', badge: 'menu.badge.new', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p6', name: 'menu.p6.name', category: 'menu.cat.seafood', price: 46,
    description: 'menu.p6.desc', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p7', name: 'menu.p7.name', category: 'menu.cat.veggie', price: 28,
    description: 'menu.p7.desc', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p8', name: 'menu.p8.name', category: 'menu.cat.veggie', price: 32,
    description: 'menu.p8.desc', soldOut: true,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p9', name: 'menu.p9.name', category: 'menu.cat.staple', price: 16,
    description: 'menu.p9.desc', soldOut: false,
    options: { portion: ['menu.option.half', 'menu.option.full'] },
  },
  {
    id: 'p10', name: 'menu.p10.name', category: 'menu.cat.staple', price: 18,
    description: 'menu.p10.desc', soldOut: false,
    options: { flavor: ['menu.option.less_ice', 'menu.option.normal_ice', 'menu.option.no_ice'] },
  },
]

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

export function getSoldOutProductIds(): string[] {
  return products.filter((p) => p.soldOut).map((p) => p.id)
}
