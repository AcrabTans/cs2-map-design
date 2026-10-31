import shapely
from shapely.errors import GEOSException


def projection_union(triangles):
    """Prefer exact union; recover floating point topology using bounded grids."""
    try:
        return shapely.union_all(triangles), None
    except GEOSException as original:
        bounds = shapely.total_bounds(triangles)
        for grid in (0.00001, 0.0001, 0.001):
            try:
                fine = shapely.union_all(triangles, grid_size=grid)
                coarse = shapely.union_all(triangles, grid_size=grid * 2)
                if fine.is_empty or not fine.is_valid or not coarse.is_valid:
                    continue
                # Check location and shape stability, rather than area alone.
                if any(abs(a-b) > grid*4 for a,b in zip(fine.bounds, bounds)):
                    continue
                difference = fine.symmetric_difference(coarse).area
                if difference > max(0.01, fine.area * 0.001):
                    continue
                return fine, {'gridMetres': grid, 'comparisonGridMetres': grid*2,
                              'shapeDifferenceM2': difference, 'originalError': str(original)}
            except GEOSException:
                continue
        raise RuntimeError('Projection union failed even with precision recovery') from original
