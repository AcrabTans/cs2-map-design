# Asset extraction libraries for Windows x64

These libraries are loaded on demand by the desktop asset extractor. Keep the
directory next to the executable.

- GEOS 3.13.1. The GEOS DLLs come from the Shapely 2.1.2 Windows x64 wheel.
  The C interface DLL is named geos_c.dll here. GEOS is dynamically loaded and
  users may replace the GEOS DLLs with a compatible build. Source and build
  files are available at https://github.com/libgeos/geos/tree/3.13.1.
  See LICENSE_GEOS.
- Zstandard 1.5.7. The DLL comes from OSGeo4W's Windows x64 distribution.
  Source is available at https://github.com/facebook/zstd/tree/v1.5.7.
  See LICENSE_ZSTD.
- Microsoft Visual C++ Redistributable runtime DLLs are provided alongside
  these libraries. See LICENSE_win32.
- The Meshoptimizer decoder is embedded in the program frontend. See
  meshoptimizer-LICENSE.md and https://github.com/zeux/meshoptimizer.
