import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the given id');
    }

    const productsExists = await this.productsRepository.findAllById(products);

    if (!productsExists.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const productsIdsExists = productsExists.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !productsIdsExists.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find product with id: ${checkInexistentProducts[0].id}`,
      );
    }

    const checkProductsWithNoQuantityAvailable = products.filter(product => {
      const productExistQuantity =
        productsExists.find(productExist => productExist.id === product.id)
          ?.quantity || 0;

      return productExistQuantity < product.quantity;
    });

    if (checkProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `Could not create order with product with id: ${checkProductsWithNoQuantityAvailable[0].id}, there is no quantity available`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price:
        productsExists.find(productExists => productExists.id === product.id)
          ?.price || 0,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const updateOrderProductsQuantity = order_products.map(orderProduct => {
      const productExists = productsExists.filter(
        p => p.id === orderProduct.product_id,
      )[0];

      return {
        id: orderProduct.product_id,
        quantity: productExists.quantity - orderProduct.quantity,
      };
    });

    await this.productsRepository.updateQuantity(updateOrderProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
