import {useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent,} from 'react'
import './App.css'

type SearchMode = 'brand' | 'name'

type SortOption =
  | 'rating-desc'
  | 'rating-asc'
  | 'year-desc'
  | 'year-asc'
  | 'popularity-desc'
  | 'popularity-asc'

type Fragrance = {
  id: number
  perfume: string
  brand: string
  country: string | null
  gender: string | null
  rating_value: number | null
  rating_count: number | null
  year: number | null
  image_url: string | null
}

type FragranceDetail = Fragrance & {
  url: string | null
  top_notes: string | null
  middle_notes: string | null
  base_notes: string | null
  perfumer1: string | null
  perfumer2: string | null
  mainaccord1: string | null
  mainaccord2: string | null
  mainaccord3: string | null
  mainaccord4: string | null
  mainaccord5: string | null
}

type BrandResult = {
  brand: string
  fragrance_count: number
  average_rating: number | null
}

type SearchSuggestion = {
  id: string
  value: string
  title: string
  subtitle: string
}

function App() {
  const [searchMode, setSearchMode] = useState<SearchMode>('brand')
  const [query, setQuery] = useState('')
  const [fragrances, setFragrances] = useState<Fragrance[]>([])
  const [sortOption, setSortOption] = useState<SortOption>('rating-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalResults, setTotalResults] = useState(0)
  const pageSize = 8
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize),)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const filterPanelRef = useRef<HTMLElement>(null)
  const [minRating, setMinRating] = useState('')
  const [maxRating, setMaxRating] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [gender, setGender] = useState('')
const [accords, setAccords] = useState<string[]>([])
const [accordInput, setAccordInput] = useState('')
const [notes, setNotes] = useState<string[]>([])
const [noteInput, setNoteInput] = useState('')
const [filterOptionType, setFilterOptionType] = useState<
  'accords' | 'notes' | null  >(null) 
const [filterOptions, setFilterOptions] = useState<string[]>([])
const [filterOptionsLoading, setFilterOptionsLoading] = useState(false)
const activeFilterCount =
  [minRating, maxRating, yearFrom, yearTo, gender].filter(Boolean).length +   accords.length +  notes.length
  const [brands, setBrands] = useState<BrandResult[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const skipNextSuggestionFetch = useRef(false)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const [selectedFragrance, setSelectedFragrance] =  useState<FragranceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      const clickedElement = event.target as Node

      const clickedButton =
        filterButtonRef.current?.contains(clickedElement)

      const clickedPanel =
        filterPanelRef.current?.contains(clickedElement)

      if (!clickedButton && !clickedPanel) {
        setFiltersOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFiltersOpen(false)
        filterButtonRef.current?.focus()
      }
    }

    if (filtersOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }



    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [filtersOpen])

  useEffect(() => {
    const modalOpen =
      detailLoading || Boolean(detailError) || Boolean(selectedFragrance)

    if (!modalOpen) {
      return
    }

    function handleModalEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeFragranceDetails()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleModalEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleModalEscape)
    }
  }, [detailLoading, detailError, selectedFragrance])
  
  useEffect(() => {
    if (skipNextSuggestionFetch.current) {
      skipNextSuggestionFetch.current = false
      return
    }

    const trimmedQuery = query.trim()

    if (trimmedQuery.length < 2) {
      setSuggestions([])
      setSuggestionsOpen(false)
      setSuggestionsLoading(false)
      setActiveSuggestionIndex(-1)
      return
    }

    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      setSuggestionsOpen(true)

      try {
        if (searchMode === 'brand') {
          const parameters = new URLSearchParams({
            name: trimmedQuery,
            limit: '6',
            offset: '0',
          })

          const response = await fetch(
            `http://127.0.0.1:8000/fragrances/brands/search?${parameters}`,
            { signal: controller.signal },
          )

          if (!response.ok) {
            throw new Error('Brand suggestions failed.')
          }

          const data: BrandResult[] = await response.json()

          setSuggestions(
            data.map((brand) => ({
              id: `brand-${brand.brand.toLowerCase()}`,
              value: brand.brand,
              title: brand.brand,
              subtitle: `${brand.fragrance_count} fragrances`,
            })),
          )
        } else {
          const parameters = new URLSearchParams({
            name: trimmedQuery,
            limit: '6',
            offset: '0',
            sort_by: 'popularity',
            order: 'desc',
          })

          const response = await fetch(
            `http://127.0.0.1:8000/fragrances/search?${parameters}`,
            { signal: controller.signal },
          )

          if (!response.ok) {
            throw new Error('Fragrance suggestions failed.')
          }

          const data: Fragrance[] = await response.json()

          setSuggestions(
            data.map((fragrance) => ({
              id: `fragrance-${fragrance.id}`,
              value: fragrance.perfume,
              title: fragrance.perfume,
              subtitle: fragrance.brand,
            })),
          )
        }

        setActiveSuggestionIndex(-1)
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name !== 'AbortError'
        ) {
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionsLoading(false)
        }
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchMode])
  useEffect(() => {
    if (!filterOptionType) {
      setFilterOptions([])
      setFilterOptionsLoading(false)
      return
    }

    const inputValue =
      filterOptionType === 'accords'
        ? accordInput
        : noteInput

    const selectedValues =
      filterOptionType === 'accords'
        ? accords
        : notes

    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setFilterOptionsLoading(true)

      try {
        const parameters = new URLSearchParams({
          query: inputValue.trim(),
          limit: '12',
        })

        const response = await fetch(
          `http://127.0.0.1:8000/fragrances/filter-options/${filterOptionType}?${parameters}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error('Filter suggestions failed.')
        }

        const data: string[] = await response.json()

        setFilterOptions(
          data.filter(
            (option) =>
              !selectedValues.some(
                (selectedValue) =>
                  selectedValue.toLowerCase() === option.toLowerCase(),
              ),
          ),
        )
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name !== 'AbortError'
        ) {
          setFilterOptions([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setFilterOptionsLoading(false)
        }
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    filterOptionType,
    accordInput,
    noteInput,
    accords,
    notes,
  ])
    const showingBrandResults =
    searchMode === 'brand' && !selectedBrand

    const hasNoResults =
      hasSearched &&
      (showingBrandResults
        ? brands.length === 0
        : fragrances.length === 0)

  function selectSuggestion(suggestion: SearchSuggestion) {
    skipNextSuggestionFetch.current = true

    setQuery(suggestion.value)
    setSuggestions([])
    setSuggestionsOpen(false)
    setActiveSuggestionIndex(-1)

    window.setTimeout(() => {
      searchFormRef.current?.requestSubmit()
    }, 0)
  }

  function handleSuggestionKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    if (!suggestionsOpen || suggestions.length === 0) {
      if (event.key === 'ArrowDown' && suggestions.length > 0) {
        setSuggestionsOpen(true)
      }

      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()

      setActiveSuggestionIndex((currentIndex) =>
        currentIndex >= suggestions.length - 1
          ? 0
          : currentIndex + 1,
      )
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()

      setActiveSuggestionIndex((currentIndex) =>
        currentIndex <= 0
          ? suggestions.length - 1
          : currentIndex - 1,
      )
    }

    if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault()
      selectSuggestion(suggestions[activeSuggestionIndex])
    }

    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
      setActiveSuggestionIndex(-1)
    }
  }

  async function openFragranceDetails(id: number) {
    setDetailLoading(true)
    setDetailError('')

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/fragrances/${id}`,
      )

      if (!response.ok) {
        throw new Error('Unable to load fragrance details.')
      }

      const fragrance: FragranceDetail = await response.json()
      setSelectedFragrance(fragrance)
    } catch {
      setDetailError(
        'We could not load this fragrance. Please try again.',
      )
    } finally {
      setDetailLoading(false)
    }
  }

  function closeFragranceDetails() {
    setSelectedFragrance(null)
    setDetailError('')
  }

  function getSortParameters(option: SortOption) {
    const [sortBy, order] = option.split('-') as [
      'rating' | 'year' | 'popularity',
      'asc' | 'desc',
    ]

    return {
      sortBy,
      order,
    }
  }

  async function loadFragrancePage(
    pageNumber: number,
    brandName = selectedBrand,
    requestedSort = sortOption,
  ) {
    setLoading(true)
    setError('')

    const trimmedQuery = query.trim()
    const { sortBy, order } = getSortParameters(requestedSort)

    try {
      const parameters = new URLSearchParams({
        limit: String(pageSize),
        offset: String((pageNumber - 1) * pageSize),
        sort_by: sortBy,
        order,
      })

      if (brandName) {
        parameters.set('brand', brandName)
      } else if (trimmedQuery) {
        parameters.set('name', trimmedQuery)
      }

      if (minRating) parameters.set('min_rating', minRating)
      if (maxRating) parameters.set('max_rating', maxRating)
      if (yearFrom) parameters.set('year_from', yearFrom)
      if (yearTo) parameters.set('year_to', yearTo)
      if (gender) parameters.set('gender', gender)
      accords.forEach((accord) => {
        parameters.append('accord', accord)
      })

      notes.forEach((note) => {
        parameters.append('note', note)
      })

      const countParameters = new URLSearchParams(parameters)
      countParameters.delete('limit')
      countParameters.delete('offset')
      countParameters.delete('sort_by')
      countParameters.delete('order')

      const [response, countResponse] = await Promise.all([
        fetch(
          `http://127.0.0.1:8000/fragrances/search?${parameters}`,
        ),
        fetch(
          `http://127.0.0.1:8000/fragrances/search/count?${countParameters}`,
        ),
      ])

      if (!response.ok || !countResponse.ok) {
        throw new Error('The fragrance search failed.')
      }

      const [data, countData]: [
        Fragrance[],
        { total: number },
      ] = await Promise.all([
        response.json(),
        countResponse.json(),
      ])

      setFragrances(data)
      setTotalResults(countData.total)
      setHasNextPage(pageNumber < Math.ceil(countData.total / pageSize))
      setCurrentPage(pageNumber)
      setPageInput(String(pageNumber))
      setHasSearched(true)

      return true
    } catch {
      setError(
        'Could not connect to the FragFriend API. Make sure the backend is running.',
      )
      setFragrances([])
      setHasNextPage(false)
      setTotalResults(0)

      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()

    const hasActiveFilters = activeFilterCount > 0

    if (!trimmedQuery && !hasActiveFilters) {
      setError('Enter a brand, fragrance, or select at least one filter.')
      return
    }
    if (
      minRating &&
      maxRating &&
      Number(minRating) > Number(maxRating)
    ) {
      setError('Minimum rating cannot be greater than maximum rating.')
      return
    }

    if (
      yearFrom &&
      yearTo &&
      Number(yearFrom) > Number(yearTo)
    ) {
      setError('Starting year cannot be greater than ending year.')
      return
    }

    setHasSearched(true)
    setLoading(true)
    setError('')
    setFiltersOpen(false)

    try {
      if (searchMode === 'brand') {
        const brandParameters = new URLSearchParams({
          limit: '8',
          offset: '0',
        })

        if (trimmedQuery) {
          brandParameters.set('name', trimmedQuery)
        }

        const response = await fetch(
          `http://127.0.0.1:8000/fragrances/brands/search?${brandParameters}`,
        )

        if (!response.ok) {
          throw new Error('The brand search failed.')
        }

        const data: BrandResult[] = await response.json()

        setBrands(data)
        setFragrances([])
        setSelectedBrand('')
        setCurrentPage(1)
        setHasNextPage(false)
        setTotalResults(0)
        return
      }

      await loadFragrancePage(1, '', sortOption)
    } catch {
      setError(
        'Could not connect to the FragFriend API. Make sure the backend is running.',
      )
      setFragrances([])
    } finally {
      setLoading(false)
    }
  }

  async function openBrand(brandName: string) {
    setSelectedBrand(brandName)
    setBrands([])

    const loaded = await loadFragrancePage(
      1,
      brandName,
      sortOption,
    )

    if (!loaded) {
      setSelectedBrand('')
    }
  }

  async function changeSort(nextSort: SortOption) {
    setSortOption(nextSort)

    await loadFragrancePage(
      1,
      selectedBrand,
      nextSort,
    )
  }

  async function changePage(nextPage: number) {
    if (nextPage < 1 || loading) {
      return
    }

    await loadFragrancePage(
      nextPage,
      selectedBrand,
      sortOption,
    )

    document
      .querySelector('.results-toolbar')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
  }

  function submitPageJump() {
    const requestedPage = Number(pageInput)

    if (
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      requestedPage > totalPages
    ) {
      setPageInput(String(currentPage))
      return
    }

    if (requestedPage !== currentPage) {
      void changePage(requestedPage)
    }
  }

  function changeSearchMode(mode: SearchMode) {
    setSearchMode(mode)
    setQuery('')
    setFragrances([])
    setError('')
    setHasSearched(false)
    setBrands([])
    setSelectedBrand('')
    setCurrentPage(1)
    setHasNextPage(false)
    setTotalResults(0)
    setSuggestions([])
    setSuggestionsOpen(false)
    setActiveSuggestionIndex(-1)
  }

  function addFilterValues(
    optionType: 'accords' | 'notes',
    rawValue: string,
  ) {
    const newValues = rawValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    if (newValues.length === 0) {
      return
    }

    if (optionType === 'accords') {
      setAccords((currentValues) => {
        const existingValues = new Set(
          currentValues.map((value) => value.toLowerCase()),
        )

        return [
          ...currentValues,
          ...newValues.filter(
            (value) => !existingValues.has(value.toLowerCase()),
          ),
        ]
      })

      setAccordInput('')
    } else {
      setNotes((currentValues) => {
        const existingValues = new Set(
          currentValues.map((value) => value.toLowerCase()),
        )

        return [
          ...currentValues,
          ...newValues.filter(
            (value) => !existingValues.has(value.toLowerCase()),
          ),
        ]
      })

      setNoteInput('')
    }
  }

  function removeFilterValue(
    optionType: 'accords' | 'notes',
    valueToRemove: string,
  ) {
    if (optionType === 'accords') {
      setAccords((currentValues) =>
        currentValues.filter((value) => value !== valueToRemove),
      )
    } else {
      setNotes((currentValues) =>
        currentValues.filter((value) => value !== valueToRemove),
      )
    }
  }

  function handleFilterInputKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    optionType: 'accords' | 'notes',
  ) {
    const inputValue =
      optionType === 'accords'
        ? accordInput
        : noteInput

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addFilterValues(optionType, inputValue)
      return
    }

    if (event.key === 'Backspace' && inputValue === '') {
      if (optionType === 'accords' && accords.length > 0) {
        removeFilterValue('accords', accords[accords.length - 1])
      }

      if (optionType === 'notes' && notes.length > 0) {
        removeFilterValue('notes', notes[notes.length - 1])
      }
    }

    if (event.key === 'Escape') {
      setFilterOptionType(null)
    }
  }

  function clearFilters() {
    setMinRating('')
    setMaxRating('')
    setYearFrom('')
    setYearTo('')
    setGender('')
    setAccords([])
    setAccordInput('')
    setNotes([])
    setNoteInput('')
    setFilterOptions([])
    setFilterOptionType(null)
    setError('')
  }

  return (
    <main className="app">
      <section className="search-section">
        <p className="eyebrow">FragFriend</p>
        <h1>Find <span className="headline-emphasis">your</span> next scent</h1>
        <p className="introduction">
          Search the fragrance collection by{' '}{searchMode === 'brand' ? 'brand' : 'fragrance'} name.
        </p>

        <form ref={searchFormRef} className="search-form" onSubmit={handleSubmit}>
          <div className="search-label-row">
            <div className="search-modifier" aria-label="Search type">
              <button
                type="button"
                className={searchMode === 'brand' ? 'active' : ''}
                aria-pressed={searchMode === 'brand'}
                onClick={() => changeSearchMode('brand')}
              >
                Brand
              </button>

              <button
                type="button"
                className={searchMode === 'name' ? 'active' : ''}
                aria-pressed={searchMode === 'name'}
                onClick={() => changeSearchMode('name')}
              >
                Fragrance
              </button>
            </div>

          <div className="search-label-actions">
            <label htmlFor="fragrance-search">
              Search by {searchMode === 'brand' ? 'brand' : 'fragrance'}
            </label>

            <button
              ref={filterButtonRef}
              type="button"
              className="filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="filter-count">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

          <div className="search-controls">
            <div className="search-input-wrapper">
              <input
                id="fragrance-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSuggestionKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0 || suggestionsLoading) {
                    setSuggestionsOpen(true)
                  }
                }}
                onBlur={() => {
                  window.setTimeout(() => setSuggestionsOpen(false), 150)
                }}
                placeholder={
                  searchMode === 'brand'
                    ? 'Try Dior, Chanel, or Gucci'
                    : 'Try Sauvage, Eros, or Most Wanted'
                }
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen}
                aria-controls="search-suggestions"
              />

              {suggestionsOpen && (
                <div
                  id="search-suggestions"
                  className="search-suggestions"
                  role="listbox"
                >
                  {suggestionsLoading ? (
                    <p className="suggestion-status">Finding matches…</p>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        role="option"
                        aria-selected={index === activeSuggestionIndex}
                        className={
                          index === activeSuggestionIndex
                            ? 'search-suggestion active'
                            : 'search-suggestion'
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectSuggestion(suggestion)}
                      >
                        <span>{suggestion.title}</span>
                        <small>{suggestion.subtitle}</small>
                      </button>
                    ))
                  ) : (
                    <p className="suggestion-status">No matching suggestions</p>
                  )}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {filtersOpen && (
            <section
              ref={filterPanelRef}
              id="filter-panel"
              className="filter-panel"
              aria-label="Search filters"
            >
              <div className="filter-panel-heading">
                <div>
                  <h2>Refine your search</h2>
                  <p>Narrow the results without changing your search.</p>
                </div>

                <div className="filter-panel-actions">
                  <button
                    type="button"
                    className="clear-filters"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>

                  <button
                    type="button"
                    className="filter-close"
                    aria-label="Close filters"
                    onClick={() => {
                      setFiltersOpen(false)
                      filterButtonRef.current?.focus()
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="filter-grid">
                <label className="filter-field">
                  <span>Minimum rating</span>
                  <select
                    value={minRating}
                    onChange={(event) => setMinRating(event.target.value)}
                  >
                    <option value="">Any rating</option>
                    <option value="2">2.0+</option>
                    <option value="3">3.0+</option>
                    <option value="3.5">3.5+</option>
                    <option value="4">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                </label>

                <label className="filter-field">
                  <span>Maximum rating</span>
                  <select
                    value={maxRating}
                    onChange={(event) => setMaxRating(event.target.value)}
                  >
                    <option value="">Any rating</option>
                    <option value="2">Up to 2.0</option>
                    <option value="3">Up to 3.0</option>
                    <option value="3.5">Up to 3.5</option>
                    <option value="4">Up to 4.0</option>
                    <option value="4.5">Up to 4.5</option>
                    <option value="5">Up to 5.0</option>
                  </select>
                </label>

                <label className="filter-field">
                  <span>Starting year</span>
                  <input
                    type="number"
                    min="1700"
                    max="2027"
                    value={yearFrom}
                    placeholder="1900"
                    onChange={(event) => setYearFrom(event.target.value)}
                  />
                </label>

                <label className="filter-field">
                  <span>Ending year</span>
                  <input
                    type="number"
                    min="1700"
                    max="2027"
                    value={yearTo}
                    placeholder="2027"
                    onChange={(event) => setYearTo(event.target.value)}
                  />
                </label>

                <label className="filter-field">
                  <span>Gender</span>
                  <select
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                  >
                    <option value="">All genders</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Unisex">Unisex</option>
                  </select>
                </label>
              </div>

              <details className="advanced-filters">
                <summary>Advanced filters</summary>

                <div className="advanced-filter-grid">
                  <div className="filter-field filter-multiselect">
                    <label htmlFor="accord-filter">
                      Main accords
                    </label>

                    <div className="filter-tag-input">
                      {accords.map((accord) => (
                        <span className="filter-tag" key={accord}>
                          {accord}

                          <button
                            type="button"
                            aria-label={`Remove ${accord}`}
                            onClick={() =>
                              removeFilterValue('accords', accord)
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}

                      <input
                        id="accord-filter"
                        type="text"
                        value={accordInput}
                        placeholder={
                          accords.length === 0
                            ? 'Search accords...'
                            : 'Add another...'
                        }
                        autoComplete="off"
                        aria-expanded={filterOptionType === 'accords'}
                        aria-controls="accord-options"
                        onFocus={() => setFilterOptionType('accords')}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setFilterOptionType(null)
                          }, 0)
                        }}
                        onChange={(event) => {
                          setAccordInput(event.target.value)
                          setFilterOptionType('accords')
                        }}
                        onKeyDown={(event) =>
                          handleFilterInputKeyDown(event, 'accords')
                        }
                      />
                    </div>

                    {filterOptionType === 'accords' && (
                      <div
                        id="accord-options"
                        className="filter-option-popup"
                        role="listbox"
                        aria-label="Accord suggestions"
                      >
                        {filterOptionsLoading ? (
                          <p>Loading suggestions…</p>
                        ) : filterOptions.length > 0 ? (
                          filterOptions.map((option) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected="false"
                              key={option}
                              onMouseDown={(event) =>
                                event.preventDefault()
                              }
                              onClick={() =>
                                addFilterValues('accords', option)
                              }
                            >
                              {option}
                            </button>
                          ))
                        ) : (
                          <p>No matching accords</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="filter-field filter-multiselect">
                    <label htmlFor="note-filter">
                      Fragrance notes
                    </label>

                    <div className="filter-tag-input">
                      {notes.map((note) => (
                        <span className="filter-tag" key={note}>
                          {note}

                          <button
                            type="button"
                            aria-label={`Remove ${note}`}
                            onClick={() =>
                              removeFilterValue('notes', note)
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}

                      <input
                        id="note-filter"
                        type="text"
                        value={noteInput}
                        placeholder={
                          notes.length === 0
                            ? 'Search notes...'
                            : 'Add another...'
                        }
                        autoComplete="off"
                        aria-expanded={filterOptionType === 'notes'}
                        aria-controls="note-options"
                        onFocus={() => setFilterOptionType('notes')}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setFilterOptionType(null)
                          }, 0)
                        }}
                        onChange={(event) => {
                          setNoteInput(event.target.value)
                          setFilterOptionType('notes')
                        }}
                        onKeyDown={(event) =>
                          handleFilterInputKeyDown(event, 'notes')
                        }
                      />
                    </div>

                    {filterOptionType === 'notes' && (
                      <div
                        id="note-options"
                        className="filter-option-popup"
                        role="listbox"
                        aria-label="Note suggestions"
                      >
                        {filterOptionsLoading ? (
                          <p>Loading suggestions…</p>
                        ) : filterOptions.length > 0 ? (
                          filterOptions.map((option) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected="false"
                              key={option}
                              onMouseDown={(event) =>
                                event.preventDefault()
                              }
                              onClick={() =>
                                addFilterValues('notes', option)
                              }
                            >
                              {option}
                            </button>
                          ))
                        ) : (
                          <p>No matching notes</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </details>
              <div className="filter-footer">
                <button
                  type="submit"
                  className="apply-filters"
                  disabled={loading}
                >
                  {loading ? 'Applying...' : 'Apply filters'}
                </button>
              </div>
            </section>
          )}

        </form>

        {error && <p className="error-message">{error}</p>}
      </section>

      <section className="results" aria-live="polite">
        {!loading && !hasSearched && !error && (
          <p>Your search results will appear here.</p>
        )}

        {!loading && hasNoResults && !error && (
          <div className="no-results">
            <h2>
              {showingBrandResults
                ? 'No matching brands found'
                : 'No matching fragrances found'}
            </h2>

            <p>
              We couldn&apos;t find any{' '}
              {showingBrandResults ? 'brands' : 'fragrances'} matching “
              {query.trim()}”. Check the spelling and try again.
            </p>
          </div>
        )}

        {searchMode === 'brand' &&
          !selectedBrand &&
          brands.map((brand) => (
            <button
              type="button"
              className="brand-card"
              key={brand.brand}
              onClick={() => openBrand(brand.brand)}
            >
              <p className="brand-card-label">Brand</p>
              <h2>{brand.brand}</h2>
              <p>
                {brand.fragrance_count}{' '}
                {brand.fragrance_count === 1 ? 'fragrance' : 'fragrances'}
              </p>
              <p>
                Average rating:{' '}
                {brand.average_rating !== null
                  ? brand.average_rating.toFixed(2)
                  : 'Not rated'}
              </p>
              <span className="card-action">
                View fragrances →
              </span>
            </button>
          ))}

        {(searchMode === 'name' || selectedBrand) &&
          fragrances.length > 0 && (
            <div className="results-toolbar">
              <div>
                <p className="results-label">
                  {selectedBrand
                    ? `${selectedBrand} fragrances`
                    : 'Fragrance results'}
                </p>

                <p className="results-page">
                  Page {currentPage} of {totalPages} ·{' '}
                  {totalResults.toLocaleString()}{' '}
                  {totalResults === 1 ? 'fragrance' : 'fragrances'}
                </p>
              </div>

              <label className="sort-control">
                <span>Sort by</span>

                <select
                  value={sortOption}
                  disabled={loading}
                  onChange={(event) =>
                    void changeSort(
                      event.target.value as SortOption,
                    )
                  }
                >
                  <option value="rating-desc">
                    Highest rating
                  </option>
                  <option value="rating-asc">
                    Lowest rating
                  </option>
                  <option value="year-desc">
                    Newest year
                  </option>
                  <option value="year-asc">
                    Oldest year
                  </option>
                  <option value="popularity-desc">
                    Most reviewed
                  </option>
                  <option value="popularity-asc">
                    Least reviewed
                  </option>
                </select>
              </label>
            </div>
          )}

        {(searchMode === 'name' || selectedBrand) && fragrances.map((fragrance) => (
          <article className="fragrance-card" key={fragrance.id}>
            <div className="fragrance-image-wrapper">
              {fragrance.image_url ? (
                <img
                  className="fragrance-image"
                  src={fragrance.image_url}
                  alt={`${fragrance.perfume} by ${fragrance.brand}`}
                  loading="lazy"
                />
              ) : (
                <div className="fragrance-image-placeholder">
                  <span>{fragrance.brand.charAt(0)}</span>
                </div>
              )}
            </div>

            <p className="brand">{fragrance.brand}</p>
            <h2>{fragrance.perfume}</h2>
            <p>
              {fragrance.year ?? 'Year unknown'} ·{' '}
              {fragrance.gender ?? 'Unisex'}
            </p>
            <p>
              Rating:{' '}
              {fragrance.rating_value !== null
                ? fragrance.rating_value.toFixed(2)
                : 'Not rated'}
            </p>

            <button
              type="button"
              className="card-action"
              onClick={() => openFragranceDetails(fragrance.id)}
            >
              View more info →
            </button>
          </article>
        ))}

        {(searchMode === 'name' || selectedBrand) &&
          fragrances.length > 0 && (
            <nav
              className="pagination"
              aria-label="Fragrance result pages"
            >
              <button
                type="button"
                disabled={loading || currentPage === 1}
                onClick={() =>
                  void changePage(currentPage - 1)
                }
              >
                ← Previous
              </button>

              <div className="page-jump">
                <label htmlFor="page-number" className="sr-only">
                  Go to page
                </label>

                <input
                  id="page-number"
                  type="text"
                  inputMode="numeric"
                  value={pageInput}
                  disabled={loading}
                  aria-label={`Current page, ${currentPage} of ${totalPages}`}
                  onChange={(event) => {
                    const nextValue = event.target.value

                    if (/^\d*$/.test(nextValue)) {
                      setPageInput(nextValue)
                    }
                  }}
                  onBlur={submitPageJump}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      submitPageJump()
                    }

                    if (event.key === 'Escape') {
                      setPageInput(String(currentPage))
                      event.currentTarget.blur()
                    }
                  }}
                />

                <span aria-hidden="true">/ {totalPages}</span>
              </div>

              <button
                type="button"
                disabled={loading || !hasNextPage}
                onClick={() =>
                  void changePage(currentPage + 1)
                }
              >
                Next →
              </button>
            </nav>
          )}
      </section>
      {(detailLoading || detailError || selectedFragrance) && (
        <div
          className="detail-backdrop"
          onClick={closeFragranceDetails}
        >
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="detail-close"
              aria-label="Close fragrance details"
              onClick={closeFragranceDetails}
            >
              ×
            </button>

            {detailLoading && (
              <p className="detail-status">Loading fragrance details…</p>
            )}

            {!detailLoading && detailError && (
              <p className="detail-error">{detailError}</p>
            )}

            {!detailLoading && selectedFragrance && (
              <>
                <div className="detail-image-wrapper">
                  {selectedFragrance.image_url ? (
                    <img
                      src={selectedFragrance.image_url}
                      alt={`${selectedFragrance.perfume} by ${selectedFragrance.brand}`}
                    />
                  ) : (
                    <div className="detail-image-placeholder">
                      {selectedFragrance.brand.charAt(0)}
                    </div>
                  )}
                </div>

                <div className="detail-content">
                  <p className="detail-brand">
                    {selectedFragrance.brand}
                  </p>

                  <h2 id="detail-title">
                    {selectedFragrance.perfume}
                  </h2>

                  <p className="detail-summary">
                    {selectedFragrance.year ?? 'Year unknown'} ·{' '}
                    {selectedFragrance.gender ?? 'Unisex'}
                  </p>

                  <p className="detail-summary">
                    Rating:{' '}
                    {selectedFragrance.rating_value !== null
                      ? selectedFragrance.rating_value.toFixed(2)
                      : 'Not rated'}
                    {selectedFragrance.rating_count !== null &&
                      ` from ${selectedFragrance.rating_count.toLocaleString()} votes`}
                  </p>

                  <div className="detail-notes">
                    <div>
                      <h3>Top notes</h3>
                      <p>{selectedFragrance.top_notes || 'Not listed'}</p>
                    </div>

                    <div>
                      <h3>Middle notes</h3>
                      <p>{selectedFragrance.middle_notes || 'Not listed'}</p>
                    </div>

                    <div>
                      <h3>Base notes</h3>
                      <p>{selectedFragrance.base_notes || 'Not listed'}</p>
                    </div>
                  </div>

                  <div className="detail-accords">
                    <h3>Main accords</h3>

                    <div>
                      {[
                        selectedFragrance.mainaccord1,
                        selectedFragrance.mainaccord2,
                        selectedFragrance.mainaccord3,
                        selectedFragrance.mainaccord4,
                        selectedFragrance.mainaccord5,
                      ]
                        .filter(
                          (accord): accord is string => Boolean(accord),
                        )
                        .map((accord) => (
                          <span key={accord}>{accord}</span>
                        ))}
                    </div>
                  </div>

                  {(selectedFragrance.perfumer1 ||
                    selectedFragrance.perfumer2) && (
                    <p className="detail-perfumer">
                      Perfumer:{' '}
                      {[
                        selectedFragrance.perfumer1,
                        selectedFragrance.perfumer2,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}

                  {selectedFragrance.url && (
                    <a
                      className="detail-source"
                      href={selectedFragrance.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View original listing →
                    </a>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App