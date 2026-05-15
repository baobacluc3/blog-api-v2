import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check() {
    const startedAt = Date.now();

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database connection is not healthy.');
    }

    return {
      status: 'ok',
      database: 'ok',
      uptime: process.uptime(),
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
