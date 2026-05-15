import { PaginationMetaDto } from './pagination-meta.dto';

describe('PaginationMetaDto', () => {
  it('calculates total pages and next/previous flags', () => {
    const meta = new PaginationMetaDto(2, 10, 25);

    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(10);
    expect(meta.total).toBe(25);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('handles empty result sets', () => {
    const meta = new PaginationMetaDto(1, 10, 0);

    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});
