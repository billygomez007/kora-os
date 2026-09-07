import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import {
  customerRecordInclude,
  toCustomerView,
  type CustomerView,
} from './customer-view.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    options: {
      search?: string;
      includeArchived?: boolean;
    } = {},
  ): Promise<CustomerView[]> {
    const search = options.search?.trim();

    const customers = await this.prisma.customerRecord.findMany({
      where: {
        organizationId,
        ...(options.includeArchived
          ? {}
          : { archivedAt: null }),
        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  phoneE164: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  emailNormalized: {
                    contains: search.toLowerCase(),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: customerRecordInclude,
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
    });

    return customers.map(toCustomerView);
  }

  async get(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerView> {
    const customer =
      await this.prisma.customerRecord.findFirst({
        where: {
          id: customerId,
          organizationId,
        },
        include: customerRecordInclude,
      });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return toCustomerView(customer);
  }

  async create(
    organizationId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerView> {
    const customer =
      await this.prisma.customerRecord.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          phoneE164: normalizeOptional(dto.phoneE164),
          emailNormalized: normalizeEmail(dto.email),
          notes: normalizeOptional(dto.notes),
        },
        include: customerRecordInclude,
      });

    return toCustomerView(customer);
  }

  async update(
    organizationId: string,
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerView> {
    await this.assertOwned(organizationId, customerId);

    const customer =
      await this.prisma.customerRecord.update({
        where: {
          organizationId_id: {
            organizationId,
            id: customerId,
          },
        },
        data: {
          ...(dto.name !== undefined
            ? { name: dto.name.trim() }
            : {}),
          ...(dto.phoneE164 !== undefined
            ? {
                phoneE164:
                  normalizeOptional(dto.phoneE164),
              }
            : {}),
          ...(dto.email !== undefined
            ? {
                emailNormalized:
                  normalizeEmail(dto.email),
              }
            : {}),
          ...(dto.notes !== undefined
            ? {
                notes: normalizeOptional(dto.notes),
              }
            : {}),
        },
        include: customerRecordInclude,
      });

    return toCustomerView(customer);
  }

  async archive(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerView> {
    await this.assertOwned(organizationId, customerId);

    const customer =
      await this.prisma.customerRecord.update({
        where: {
          organizationId_id: {
            organizationId,
            id: customerId,
          },
        },
        data: {
          archivedAt: new Date(),
        },
        include: customerRecordInclude,
      });

    return toCustomerView(customer);
  }

  async restore(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerView> {
    await this.assertOwned(organizationId, customerId);

    const customer =
      await this.prisma.customerRecord.update({
        where: {
          organizationId_id: {
            organizationId,
            id: customerId,
          },
        },
        data: {
          archivedAt: null,
        },
        include: customerRecordInclude,
      });

    return toCustomerView(customer);
  }

  private async assertOwned(
    organizationId: string,
    customerId: string,
  ) {
    const customer =
      await this.prisma.customerRecord.findFirst({
        where: {
          id: customerId,
          organizationId,
        },
        select: { id: true },
      });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }
}

function normalizeOptional(
  value: string | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEmail(
  value: string | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}
