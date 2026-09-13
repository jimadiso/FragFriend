import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from 'react'

import { AuthModal } from './components/AuthModal'
import { BladeNavigation } from './components/BladeNavigation'
import { useBladePages, type BladePage } from './components/useBladePages'
import type {
  AuthMode,
  AuthResponse,
  AuthUser,
} from './types/auth'

import {
  addBookmark,
  getBookmarks,
  getBookmarkStatus,
  removeBookmark,
  type BookmarkedFragrance,
} from './services/bookmarkApi'

import {
  addFragranceToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  getCollections,
  removeFragranceFromCollection,
  updateCollection,
  type FragranceCollection,
  type FragranceCollectionDetail,
} from './services/collectionApi'

import {
  discoverMoreFragrances,
  discoverFragrances,
  type DiscoveryResponse,
} from './services/discoveryApi'

import './App.css'
import {
  COLLECTION_LIMIT,
  SAVED_FRAGRANCE_LIMIT,
} from './constants/libraryLimits'

type SearchMode = 'brand' | 'name'
type SavedTab = 'all' | 'collections'

type SortOption =
  | 'rating-desc'
  | 'rating-asc'
  | 'year-desc'
  | 'year-asc'
  | 'popularity-desc'
  | 'popularity-asc'

type BrandSortOption =
  | 'count-desc'
  | 'rating-desc'
  | 'name-asc'

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
  flat_notes?: string | null
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

const AUTH_TOKEN_STORAGE_KEY = 'fragfriend_access_token'
const AUTH_USER_STORAGE_KEY = 'fragfriend_user'
const API_BASE_URL = 'http://127.0.0.1:8000'

const DISCOVERY_PROMPT_SUGGESTIONS = [
  'Fresh citrus for summer days',
  'Warm woody scent for autumn',
  'Sweet fragrance for a night out',
  'Clean everyday fragrance for the office',
  'Cozy vanilla scent for winter evenings',
  'Light floral fragrance for spring',
  'Smoky leather fragrance for a formal event',
  'Fresh aquatic scent for a beach vacation',
  'Soft musky fragrance for a date night',
  'Green aromatic scent for warm weather',
  'Spicy amber fragrance with strong reviews',
  'Fruity fragrance that is easy to wear',
] as const

function chooseDiscoveryPrompts(previous: readonly string[] = []): string[] {
  const unused = DISCOVERY_PROMPT_SUGGESTIONS.filter(
    (suggestion) => !previous.includes(suggestion),
  )
  const choices = [...(unused.length >= 3 ? unused : DISCOVERY_PROMPT_SUGGESTIONS)]

  for (let index = choices.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[choices[index], choices[randomIndex]] = [choices[randomIndex], choices[index]]
  }

  return choices.slice(0, 3)
}

type DiscoveryPreferenceChip = {
  key: string
  label: string
}

function toScentTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
}

function getDiscoveryPreferenceChips(
  preferences: DiscoveryResponse['preferences'],
) {
  const chips: DiscoveryPreferenceChip[] = []

  if (preferences.brand) chips.push({ key: 'brand', label: `Brand: ${preferences.brand}` })
  if (preferences.gender) chips.push({ key: 'gender', label: preferences.gender })
  preferences.notes.forEach((note, index) => chips.push({ key: `note-${index}`, label: `Note: ${toScentTitle(note)}` }))
  preferences.accords.forEach((accord, index) => chips.push({ key: `accord-${index}`, label: `Accord: ${toScentTitle(accord)}` }))
  if (preferences.season) {
    chips.push({ key: 'season', label: preferences.season.charAt(0).toUpperCase() + preferences.season.slice(1) })
  }
  if (preferences.time_of_day) {
    chips.push({ key: 'time-of-day', label: preferences.time_of_day.charAt(0).toUpperCase() + preferences.time_of_day.slice(1) })
  }
  if (preferences.min_rating !== null) {
    chips.push({ key: 'min-rating', label: `${preferences.min_rating.toFixed(1)}+ rating` })
  }
  if (preferences.min_votes !== null) {
    chips.push({ key: 'min-votes', label: `${preferences.min_votes.toLocaleString()}+ votes` })
  }
  if (preferences.prefer_popular) chips.push({ key: 'popular', label: 'Popular' })
  if (preferences.year_from !== null || preferences.year_to !== null) {
    chips.push({
      key: 'year-range',
      label: preferences.year_from !== null && preferences.year_to !== null
        ? `${preferences.year_from}–${preferences.year_to}`
        : preferences.year_from !== null
          ? `${preferences.year_from}+`
          : `Up to ${preferences.year_to}`,
    })
  }

  return chips
}

function removeDiscoveryPreference(
  preferences: DiscoveryResponse['preferences'],
  key: string,
) {
  if (key === 'brand') return { ...preferences, brand: null }
  if (key === 'gender') return { ...preferences, gender: null }
  if (key === 'season') return { ...preferences, season: null }
  if (key === 'time-of-day') return { ...preferences, time_of_day: null }
  if (key === 'min-rating') return { ...preferences, min_rating: null }
  if (key === 'min-votes') return { ...preferences, min_votes: null }
  if (key === 'popular') return { ...preferences, prefer_popular: false }
  if (key === 'year-range') return { ...preferences, year_from: null, year_to: null }
  if (key.startsWith('note-')) {
    const index = Number(key.slice('note-'.length))
    return { ...preferences, notes: preferences.notes.filter((_, itemIndex) => itemIndex !== index) }
  }
  if (key.startsWith('accord-')) {
    const index = Number(key.slice('accord-'.length))
    return { ...preferences, accords: preferences.accords.filter((_, itemIndex) => itemIndex !== index) }
  }
  return preferences
}

function readStoredUser(): AuthUser | null {
  const storedUser = sessionStorage.getItem(
    AUTH_USER_STORAGE_KEY,
  )

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser) as AuthUser
  } catch {
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    return null
  }
}

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readStoredUser)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const { page: appView, navigate: setAppView, surface: bladeSurface } = useBladePages()
  const [savedTab, setSavedTab] = useState<SavedTab>('all')
  const [savedFragrances, setSavedFragrances] = useState<BookmarkedFragrance[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedError, setSavedError] = useState('')
  const [savedRemovalTarget, setSavedRemovalTarget] = useState<BookmarkedFragrance | null>(null)
  const [savedRemovalLoading, setSavedRemovalLoading] = useState(false)
  const [savedRemovalError, setSavedRemovalError] = useState('')
  const [collections, setCollections] = useState<FragranceCollection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionsError, setCollectionsError] = useState('')
  const [collectionFormOpen, setCollectionFormOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<FragranceCollectionDetail | null>(null)
  const [selectedCollectionLoading, setSelectedCollectionLoading] = useState(false)
  const [selectedCollectionError, setSelectedCollectionError] = useState('')
  const [collectionName, setCollectionName] = useState('')
  const [collectionDescription, setCollectionDescription] = useState('')
  const [collectionSubmitting, setCollectionSubmitting] = useState(false)
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false)
  const [collectionDeleting, setCollectionDeleting] = useState(false)
  const [collectionDeleteConfirmOpen, setCollectionDeleteConfirmOpen] = useState(false)
  const [collectionEditing, setCollectionEditing] = useState(false)
  const [collectionEditName, setCollectionEditName] = useState('')
  const [collectionEditDescription, setCollectionEditDescription] = useState('')
  const [collectionEditSaving, setCollectionEditSaving] = useState(false)
  const [collectionEditError, setCollectionEditError] = useState('')
  const [collectionActionLoadingId, setCollectionActionLoadingId] = useState<number | null>(null)
  const [collectionActionError, setCollectionActionError] = useState('')
  const [collectionActionMessage, setCollectionActionMessage] = useState('')
  const [collectionFormError, setCollectionFormError] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('brand')
  const [query, setQuery] = useState('')
  const [discoveryPrompt, setDiscoveryPrompt] = useState('')
  const [discoveryExamples, setDiscoveryExamples] = useState(() =>
    chooseDiscoveryPrompts(),
  )
  const [discoveryOriginalPrompt, setDiscoveryOriginalPrompt] = useState('')
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResponse | null>(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [aiSearch, setAiSearch] = useState(false)
  const [aiBrand, setAiBrand] = useState('')
  const [aiSeason, setAiSeason] = useState<DiscoveryResponse['preferences']['season']>(null)
  const [aiDaypart, setAiDaypart] = useState<DiscoveryResponse['preferences']['time_of_day']>(null)
  const [aiMinVotes, setAiMinVotes] = useState('')
  const [matchReasons, setMatchReasons] = useState<Record<number, string[]>>({})
  const searchGeneration = useRef(0)
  const [discoveryPreferencesLoading, setDiscoveryPreferencesLoading] = useState(false)
  const [hasDiscoveryRun, setHasDiscoveryRun] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [fragrances, setFragrances] = useState<Fragrance[]>([])
  const [sortOption, setSortOption] = useState<SortOption>('popularity-desc')
  const [brandSortOption, setBrandSortOption] = useState<BrandSortOption>('count-desc')
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
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
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
  const [filterOptionType, setFilterOptionType] = useState<'accords' | 'notes' | null>(null)
  const [filterOptions, setFilterOptions] = useState<string[]>([])
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false)
  const activeFilterCount = [minRating, maxRating, yearFrom, yearTo, gender, aiBrand, aiSeason, aiDaypart, aiMinVotes].filter(Boolean).length + accords.length + notes.length
  const [brands, setBrands] = useState<BrandResult[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const skipNextSuggestionFetch = useRef(false)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const [selectedFragrance, setSelectedFragrance] =  useState<FragranceDetail | null>(null)
  const [selectedDiscoveryReasons, setSelectedDiscoveryReasons] = useState<string[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkLoading, setBookmarkLoading] = useState(false)
  const [bookmarkError, setBookmarkError] = useState('')

  useEffect(() => {
    const storedToken = sessionStorage.getItem(
      AUTH_TOKEN_STORAGE_KEY,
    )

    if (!storedToken) {
      return
    }

    const controller = new AbortController()

    async function validateSession() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
            signal: controller.signal,
          },
        )

        if (response.status === 401) {
          sessionStorage.removeItem(
            AUTH_TOKEN_STORAGE_KEY,
          )
          sessionStorage.removeItem(
            AUTH_USER_STORAGE_KEY,
          )
          setCurrentUser(null)
          return
        }

        if (!response.ok) {
          return
        }

        const user: AuthUser = await response.json()

        sessionStorage.setItem(
          AUTH_USER_STORAGE_KEY,
          JSON.stringify(user),
        )
        setCurrentUser(user)
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name !== 'AbortError'
        ) {
          return
        }
      }
    }

    validateSession()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!selectedFragrance || !currentUser) {
      return
    }

    let requestIsCurrent = true

    async function loadBookmarkStatus() {
      setBookmarkError('')
      setBookmarkLoading(true)

      try {
        const status = await getBookmarkStatus(
          selectedFragrance!.id,
        )

        if (requestIsCurrent) {
          setIsBookmarked(status.bookmarked)
        }
      } catch (requestError) {
        if (requestIsCurrent) {
          setBookmarkError(
            requestError instanceof Error
              ? requestError.message
              : 'We could not load this bookmark.',
          )
        }
      } finally {
        if (requestIsCurrent) {
          setBookmarkLoading(false)
        }
      }
    }

    loadBookmarkStatus()

    return () => {
      requestIsCurrent = false
    }
  }, [selectedFragrance, currentUser])

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

  async function openFragranceDetails(
    id: number,
    discoveryReasons: string[] = [],
  ) {
    setDetailLoading(true)
    setDetailError('')
    setSelectedDiscoveryReasons(discoveryReasons)
    setBookmarkError('')
    setIsBookmarked(false)
    setBookmarkLoading(false)

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

  async function handleDiscoverySubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const trimmedPrompt = discoveryPrompt.trim()
    if (trimmedPrompt.length < 3 || discoveryLoading) {
      return
    }

    const request = discoveryOriginalPrompt
      ? `Original request: ${discoveryOriginalPrompt}\nAdditional preference: ${trimmedPrompt}`
      : trimmedPrompt

    setHasDiscoveryRun(true)
    setDiscoveryLoading(true)
    setDiscoveryError('')

    try {
      const response = await discoverFragrances(request)
      setDiscoveryResult(response)

      if (response.follow_up_question) {
        setDiscoveryOriginalPrompt(
          discoveryOriginalPrompt || trimmedPrompt,
        )
        setDiscoveryPrompt('')
      } else {
        setDiscoveryOriginalPrompt('')
        syncDiscoveryFilters(response.preferences)
        setQuery('')
        setMaxRating('')
        const nextSort = 'popularity-desc'
        setSortOption(nextSort)
        await loadAiPage(1, response.preferences, nextSort, '', '')
      }
    } catch (requestError) {
      setDiscoveryError(
        requestError instanceof Error
          ? requestError.message
          : 'Discovery is unavailable right now.',
      )
    } finally {
      setDiscoveryLoading(false)
    }
  }

  function startDiscoveryExample(example: string) {
    setDiscoveryPrompt(example)
    setDiscoveryError('')
  }

  function resetDiscovery() {
    setDiscoveryPrompt('')
    setDiscoveryOriginalPrompt('')
    setDiscoveryResult(null)
    setDiscoveryError('')
    setHasDiscoveryRun(false)
  }

  async function removeAppliedDiscoveryPreference(key: string) {
    if (!discoveryResult || discoveryPreferencesLoading) {
      return
    }

    const preferences = removeDiscoveryPreference(
      discoveryResult.preferences,
      key,
    )
    setDiscoveryPreferencesLoading(true)
    setDiscoveryError('')

    try {
      syncDiscoveryFilters(preferences)
      const nextSort = sortOption
      setSortOption(nextSort)
      await loadAiPage(1, preferences, nextSort, query, maxRating)
    } catch (requestError) {
      setDiscoveryError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not update the discovery preferences. Please try again.',
      )
    } finally {
      setDiscoveryPreferencesLoading(false)
    }
  }

  function syncDiscoveryFilters(preferences: DiscoveryResponse['preferences']) {
    setAiSearch(true)
    setSearchMode('name')
    setSelectedBrand('')
    setBrands([])
    setSuggestionsOpen(false)
    setAiBrand(preferences.brand || '')
    setAiSeason(preferences.season)
    setAiDaypart(preferences.time_of_day)
    setAiMinVotes(preferences.min_votes?.toString() || '')
    setMinRating(preferences.min_rating?.toString() || '')
    setYearFrom(preferences.year_from?.toString() || '')
    setYearTo(preferences.year_to?.toString() || '')
    setGender(preferences.gender || '')
    setNotes(preferences.notes)
    setAccords(preferences.accords)
  }

  function currentAiPreferences(sort: SortOption): DiscoveryResponse['preferences'] {
    return {
      brand: aiBrand || null, gender: (gender || null) as DiscoveryResponse['preferences']['gender'],
      season: aiSeason, time_of_day: aiDaypart, notes, accords,
      min_rating: minRating ? Number(minRating) : null,
      min_votes: aiMinVotes ? Number(aiMinVotes) : null,
      year_from: yearFrom ? Number(yearFrom) : null, year_to: yearTo ? Number(yearTo) : null,
      prefer_popular: sort === 'popularity-desc', occasion: null,
      needs_follow_up: false, follow_up_question: null,
    }
  }

  async function loadAiPage(page: number, preferences: DiscoveryResponse['preferences'], sort: SortOption, name: string, maximum: string) {
    const generation = ++searchGeneration.current
    setLoading(true)
    setError('')
    try {
      const { sortBy, order } = getSortParameters(sort)
      const response = await discoverMoreFragrances(preferences, (page - 1) * pageSize, {
        limit: pageSize, name, max_rating: maximum ? Number(maximum) : null, sort_by: sortBy, order,
      })
      if (generation !== searchGeneration.current) return false
      setDiscoveryResult(response)
      setFragrances(response.matches.map(match => match.fragrance))
      setMatchReasons(Object.fromEntries(response.matches.map(match => [match.fragrance.id, match.why_matched])))
      setTotalResults(response.total)
      setHasNextPage(page * pageSize < response.total)
      setCurrentPage(page)
      setPageInput(String(page))
      setHasSearched(true)
      return true
    } catch {
      if (generation === searchGeneration.current) setError('Could not load these matches. Check the filters and try again.')
      return false
    } finally {
      if (generation === searchGeneration.current) setLoading(false)
    }
  }

  function closeFragranceDetails() {
    setSelectedFragrance(null)
    setSelectedDiscoveryReasons([])
    setDetailError('')
    setBookmarkError('')
    setIsBookmarked(false)
    setBookmarkLoading(false)
    setCollectionPickerOpen(false)
    setCollectionActionError('')
    setCollectionActionMessage('')
    setCollectionActionLoadingId(null)
  }

  async function toggleSelectedFragranceBookmark() {
    if (!currentUser) {
      openAuthModal('login')
      return
    }

    if (!selectedFragrance || bookmarkLoading) {
      return
    }

    setBookmarkLoading(true)
    setBookmarkError('')

    try {
      const status = isBookmarked
        ? await removeBookmark(selectedFragrance.id)
        : await addBookmark(selectedFragrance.id)

      setIsBookmarked(status.bookmarked)

      if (!status.bookmarked) {
        setSavedFragrances((currentFragrances) =>
          currentFragrances.filter(
            (fragrance) =>
              fragrance.id !== selectedFragrance.id,
          ),
        )
      }

    } catch (requestError) {
      setBookmarkError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not update this bookmark.',
      )
    } finally {
      setBookmarkLoading(false)
    }
  }

  async function confirmSavedFragranceRemoval() {
    if (!savedRemovalTarget || savedRemovalLoading) return

    const fragranceId = savedRemovalTarget.id
    setSavedRemovalLoading(true)
    setSavedRemovalError('')

    try {
      await removeBookmark(fragranceId)
      setSavedFragrances((current) => current.filter((fragrance) => fragrance.id !== fragranceId))
      setSelectedCollection((current) => current
        ? { ...current, fragrances: current.fragrances.filter((fragrance) => fragrance.id !== fragranceId) }
        : null)
      setSavedRemovalTarget(null)
      try {
        setCollections(await getCollections())
      } catch {
        // The removal succeeded even if collection counts could not refresh.
      }
    } catch (requestError) {
      setSavedRemovalError(requestError instanceof Error ? requestError.message : 'We could not remove this fragrance from Saved.')
    } finally {
      setSavedRemovalLoading(false)
    }
  }

  async function openCollectionPicker() {
    if (!currentUser) {
      openAuthModal('login')
      return
    }

    setCollectionPickerOpen(true)
    setCollectionActionError('')
    setCollectionActionMessage('')
    setCollectionsLoading(true)

    try {
      const collectionResults = await getCollections()
      setCollections(collectionResults)
    } catch (requestError) {
      setCollectionActionError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not load your collections.',
      )
    } finally {
      setCollectionsLoading(false)
    }
  }

  async function addSelectedFragranceToCollection(
    collectionId: number,
  ) {
    if (
      !selectedFragrance ||
      collectionActionLoadingId !== null
    ) {
      return
    }

    const selectedCollection = collections.find(
      (collection) => collection.id === collectionId,
    )

    setCollectionActionLoadingId(collectionId)
    setCollectionActionError('')
    setCollectionActionMessage('')

    try {
      await addFragranceToCollection(
        collectionId,
        selectedFragrance.id,
      )

      setIsBookmarked(true)
      setCollectionActionMessage(
        selectedCollection
          ? `Added to ${selectedCollection.name}.`
          : 'Added to collection.',
      )

      try {
        const refreshedCollections =
          await getCollections()
        setCollections(refreshedCollections)
      } catch {
        // The fragrance was still added successfully.
      }
    } catch (requestError) {
      setCollectionActionError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not add this fragrance.',
      )
    } finally {
      setCollectionActionLoadingId(null)
    }
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

  async function loadBrandPage( pageNumber: number, requestedSort = brandSortOption, ) {
    setLoading(true)
    setError('')

    const trimmedQuery = query.trim()
    const [sortBy, order] = requestedSort.split('-') as [
      'count' | 'rating' | 'name',
      'asc' | 'desc',
    ]


    try {
      const parameters = new URLSearchParams({
        limit: String(pageSize),
        offset: String((pageNumber - 1) * pageSize),
        sort_by: sortBy,
        order,
      })

      if (trimmedQuery) {
        parameters.set('name', trimmedQuery)
      }

      if (minRating) parameters.set('min_rating', minRating)
      if (maxRating) parameters.set('max_rating', maxRating)
      if (aiMinVotes) parameters.set('min_vote', aiMinVotes)
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
      countParameters.delete('order')

      const [response, countResponse] = await Promise.all([
        fetch(
          `http://127.0.0.1:8000/fragrances/brands/search?${parameters}`,
        ),
        fetch(
          `http://127.0.0.1:8000/fragrances/brands/search/count?${countParameters}`,
        ),
      ])

      if (!response.ok || !countResponse.ok) {
        throw new Error('The brand search failed.')
      }

      const [data, countData]: [
        BrandResult[],
        { total: number },
      ] = await Promise.all([
        response.json(),
        countResponse.json(),
      ])

      setBrands(data)
      setFragrances([])
      setSelectedBrand('')
      setTotalResults(countData.total)
      setHasNextPage(
        pageNumber < Math.ceil(countData.total / pageSize),
      )
      setCurrentPage(pageNumber)
      setPageInput(String(pageNumber))
      setHasSearched(true)

      return true
    } catch {
      setError(
        'Could not connect to the FragFriend API. Make sure the backend is running.',
      )
      setBrands([])
      setHasNextPage(false)
      setTotalResults(0)

      return false
    } finally {
      setLoading(false)
    }
  }

  async function loadFragrancePage(
    pageNumber: number,
    brandName = selectedBrand,
    requestedSort = sortOption,
  ) {
    if (aiSearch) return loadAiPage(pageNumber, currentAiPreferences(requestedSort), requestedSort, query, maxRating)
    setMatchReasons({})
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
      } else if (aiBrand) {
        parameters.set('brand', aiBrand)
      } else if (trimmedQuery) {
        parameters.set('name', trimmedQuery)
      }

      if (minRating) parameters.set('min_rating', minRating)
      if (maxRating) parameters.set('max_rating', maxRating)
      if (aiMinVotes) parameters.set('min_vote', aiMinVotes)
      if (yearFrom) parameters.set('year_from', yearFrom)
      if (yearTo) parameters.set('year_to', yearTo)
      if (gender) parameters.set('gender', gender)
      if (aiSeason) parameters.set('season', aiSeason)
      if (aiDaypart) parameters.set('time_of_day', aiDaypart)
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

    if (!trimmedQuery && !hasActiveFilters && !aiSearch) {
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
        await loadBrandPage(1)
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

  async function changeBrandSort(
    nextSort: BrandSortOption,
  ) {
    setBrandSortOption(nextSort)
    await loadBrandPage(1, nextSort)
  }

  async function changePage(nextPage: number) {
    if (nextPage < 1 || loading) {
      return
    }

    if (showingBrandResults) {
      await loadBrandPage(nextPage)
    } else {
      await loadFragrancePage(
        nextPage,
        selectedBrand,
        sortOption,
      )
    }

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
    searchGeneration.current += 1
    setAiSearch(false)
    setMatchReasons({})
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
    setSuggestionsLoading(false)
    setActiveSuggestionIndex(-1)
  }

  function addFilterValues(
    optionType: 'accords' | 'notes',
    rawValue: string,
  ) {
    const newValues = rawValue
      .split(',')
      .map((value) => toScentTitle(value))
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

  function closeFilterOptions() {
    setFilterOptionType(null)
    setFilterOptions([])
    setFilterOptionsLoading(false)
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
      closeFilterOptions()
    }
  }

  function clearFilters() {
    setAiBrand('')
    setAiSeason(null)
    setAiDaypart(null)
    setAiMinVotes('')
    setMinRating('')
    setMaxRating('')
    setYearFrom('')
    setYearTo('')
    setGender('')
    setAccords([])
    setAccordInput('')
    setNotes([])
    setNoteInput('')
    setDiscoveryResult((current) => current
      ? {
          ...current,
          preferences: {
            ...current.preferences,
            brand: null,
            gender: null,
            notes: [],
            accords: [],
            season: null,
            time_of_day: null,
            min_rating: null,
            min_votes: null,
            prefer_popular: false,
            year_from: null,
            year_to: null,
          },
        }
      : null)
    closeFilterOptions()
    setError('')
  }

  function openAuthModal(mode: AuthMode) {
    setAuthMode(mode)
    setAuthModalOpen(true)
  }

  function handleAuthenticated(
    authentication: AuthResponse,
  ) {
    sessionStorage.setItem(
      AUTH_TOKEN_STORAGE_KEY,
      authentication.access_token,
    )
    sessionStorage.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(authentication.user),
    )

    setCurrentUser(authentication.user)
  }

  async function openSavedLibrary() {
    if (!currentUser) {
      openAuthModal('login')
      return
    }

    setAppView('saved')
    setSavedLoading(savedFragrances.length === 0)
    setSavedError('')

    try {
      const bookmarks = await getBookmarks()
      setSavedFragrances(bookmarks)
    } catch (requestError) {
      setSavedError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not load your saved fragrances.',
      )
    } finally {
      setSavedLoading(false)
    }
  }

  async function openCollectionsTab() {
    setSavedTab('collections')
    setCollectionsLoading(true)
    setCollectionsError('')

    try {
      const collectionResults = await getCollections()
      setCollections(collectionResults)
    } catch (requestError) {
      setCollectionsError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not load your collections.',
      )
    } finally {
      setCollectionsLoading(false)
    }
  }

  async function openCollection(collectionId: number) {
    setSelectedCollection(null)
    setSelectedCollectionLoading(true)
    setSelectedCollectionError('')

    try {
      const collection = await getCollection(collectionId)
      setSelectedCollection(collection)
      setCollectionEditName(collection.name)
      setCollectionEditDescription(collection.description || '')
      setCollectionEditing(false)
      setCollectionEditError('')
    } catch (requestError) {
      setSelectedCollectionError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not load this collection.',
      )
    } finally {
      setSelectedCollectionLoading(false)
    }
  }

  function closeCollection() {
    setSelectedCollection(null)
    setSelectedCollectionError('')
    setCollectionDeleteConfirmOpen(false)
    setCollectionEditing(false)
    setCollectionEditError('')
  }

  async function saveSelectedCollection(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (!selectedCollection || collectionEditSaving) return

    const name = collectionEditName.trim()
    if (!name) {
      setCollectionEditError('Enter a name for your collection.')
      return
    }

    setCollectionEditSaving(true)
    setCollectionEditError('')

    try {
      const updated = await updateCollection(
        selectedCollection.id,
        {
          name,
          description:
            collectionEditDescription.trim() || null,
        },
      )
      setSelectedCollection((current) =>
        current ? { ...current, ...updated } : current,
      )
      setCollections((current) =>
        current.map((collection) =>
          collection.id === updated.id
            ? { ...collection, ...updated }
            : collection,
        ),
      )
      setCollectionEditName(updated.name)
      setCollectionEditDescription(updated.description || '')
      setCollectionEditing(false)
    } catch (requestError) {
      setCollectionEditError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not update this collection.',
      )
    } finally {
      setCollectionEditSaving(false)
    }
  }

  async function removeSelectedCollectionFragrance(
    fragranceId: number,
  ) {
    if (
      !selectedCollection ||
      collectionActionLoadingId !== null
    ) {
      return
    }

    const collectionId = selectedCollection.id

    setCollectionActionLoadingId(fragranceId)
    setSelectedCollectionError('')

    try {
      await removeFragranceFromCollection(
        collectionId,
        fragranceId,
      )

      setSelectedCollection((currentCollection) => {
        if (
          !currentCollection ||
          currentCollection.id !== collectionId
        ) {
          return currentCollection
        }

        return {
          ...currentCollection,
          fragrance_count: Math.max(
            0,
            currentCollection.fragrance_count - 1,
          ),
          fragrances: currentCollection.fragrances.filter(
            (fragrance) => fragrance.id !== fragranceId,
          ),
        }
      })

      setCollections((currentCollections) =>
        currentCollections.map((collection) =>
          collection.id === collectionId
            ? {
                ...collection,
                fragrance_count: Math.max(
                  0,
                  collection.fragrance_count - 1,
                ),
              }
            : collection,
        ),
      )
    } catch (requestError) {
      setSelectedCollectionError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not remove this fragrance.',
      )
    } finally {
      setCollectionActionLoadingId(null)
    }
  }

  async function confirmDeleteSelectedCollection() {
    if (!selectedCollection || collectionDeleting) {
      return
    }

    const collectionId = selectedCollection.id
    setCollectionDeleting(true)
    setSelectedCollectionError('')

    try {
      await deleteCollection(collectionId)

      setCollections((currentCollections) =>
        currentCollections.filter(
          (collection) => collection.id !== collectionId,
        ),
      )

      setSelectedCollection(null)
      setCollectionDeleteConfirmOpen(false)
    } catch (requestError) {
      setSelectedCollectionError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not delete this collection.',
      )
    } finally {
      setCollectionDeleting(false)
    }
  }

  async function handleCreateCollection(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (collections.length >= COLLECTION_LIMIT) {
      setCollectionFormError(
        `You have reached the limit of ${COLLECTION_LIMIT} collections. Delete one before creating another.`,
      )
      return
    }

    const trimmedName = collectionName.trim()
    const trimmedDescription =
      collectionDescription.trim()

    if (!trimmedName) {
      setCollectionFormError(
        'Enter a name for your collection.',
      )
      return
    }

    setCollectionSubmitting(true)
    setCollectionFormError('')

    try {
      const newCollection = await createCollection({
        name: trimmedName,
        description: trimmedDescription || null,
      })

      setCollections((currentCollections) => [
        newCollection,
        ...currentCollections,
      ])
      setCollectionName('')
      setCollectionDescription('')
      setCollectionFormOpen(false)
    } catch (requestError) {
      setCollectionFormError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not create this collection.',
      )
    } finally {
      setCollectionSubmitting(false)
    }
  }

  function signOut() {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    setCurrentUser(null)
    setBookmarkError('')
    setIsBookmarked(false)
    setBookmarkLoading(false)
    setSavedFragrances([])
    setSavedError('')
    setCollections([])
    setCollectionsError('')
    setCollectionFormOpen(false)
    setAppView('search')
    window.location.reload()
  }

  function navigatePage(page: BladePage) {
    if (page === appView) return
    setFiltersOpen(false)
    if (page === 'saved') void openSavedLibrary()
    else setAppView(page)
  }

  return (
    <main className="app">
      <BladeNavigation page={appView} onNavigate={navigatePage}
        disabled={authModalOpen || filtersOpen || detailLoading || Boolean(detailError) || Boolean(selectedFragrance) || selectedCollectionLoading || Boolean(selectedCollectionError) || Boolean(selectedCollection) || Boolean(savedRemovalTarget)} />
      <header className="account-header">
                {currentUser ? (
          <div className="account-session">
            <span>
              Hello, {currentUser.display_name}
            </span>

            <button type="button" className="search-navigation-button" aria-label="Go to Search" title="Search" onClick={() => navigatePage('search')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            </button>

            <button
              type="button"
              className="bookmark-navigation-button"
              aria-label="Go to Collections"
              title="Collections"
              onClick={() => navigatePage('saved')}
            >
              <span
                className="bookmark-ribbon-icon"
                aria-hidden="true"
              />
            </button>

            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="account-actions">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
            >
              Sign in
            </button>

            <button
              type="button"
              className="create-account-button"
              onClick={() => openAuthModal('register')}
            >
              Create account
            </button>
          </div>
        )}
      </header>
      <div ref={bladeSurface} className="blade-surface" tabIndex={-1} role="region" aria-label={appView === 'search' ? 'Search page' : 'Collections page'}>
      <section
        className="search-section"
        hidden={appView !== 'search'}
      >
        <p className="eyebrow">FragFriend</p>
        <h1>
          Find{' '}
          <span className="headline-emphasis headline-emphasis-wave">
            {['y', 'o', 'u', 'r'].map((letter, index) => (
              <span
                key={letter}
                style={{ animationDelay: `${index * 110}ms` }}
              >
                {letter}
              </span>
            ))}
          </span>{' '}
          next scent
        </h1>
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
                onChange={(event) => {
                  const nextQuery = event.target.value
                  setQuery(nextQuery)

                  if (nextQuery.trim().length < 2) {
                    setSuggestions([])
                    setSuggestionsOpen(false)
                    setSuggestionsLoading(false)
                    setActiveSuggestionIndex(-1)
                  }
                }}
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
                <>
                  <label className="filter-field"><span>Minimum votes</span><input type="number" min="0" value={aiMinVotes} onChange={(event) => setAiMinVotes(event.target.value)} placeholder="Any number of votes" /></label>
                  <label className="filter-field"><span>Season</span><select value={aiSeason || ''} onChange={event => setAiSeason((event.target.value || null) as typeof aiSeason)}><option value="">Any Season</option>{['winter','spring','summer','autumn'].map(value => <option key={value} value={value}>{toScentTitle(value)}</option>)}</select></label>
                  <label className="filter-field"><span>Time of day</span><select value={aiDaypart || ''} onChange={event => setAiDaypart((event.target.value || null) as typeof aiDaypart)}><option value="">Any time</option><option value="day">Day</option><option value="night">Night</option></select></label>
                </>

                <label className="filter-field advanced-value">
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

                <label className="filter-field advanced-value">
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

                <label className="filter-field advanced-value">
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

                <label className="filter-field advanced-value">
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

              <div className="main-scent-filters">

                <div className="advanced-filter-grid">
                  <div className="filter-field filter-multiselect">
                    <label htmlFor="accord-filter">
                      Main accords
                    </label>

                    <div className="filter-tag-input">
                      {accords.map((accord) => (
                        <span className="filter-tag" key={accord}>
                          {toScentTitle(accord)}

                          <button
                            type="button"
                            aria-label={`Remove ${toScentTitle(accord)}`}
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
                            closeFilterOptions()
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
                          {toScentTitle(note)}

                          <button
                            type="button"
                            aria-label={`Remove ${toScentTitle(note)}`}
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
                            closeFilterOptions()
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
              </div>
              <div className={`advanced-filters ${advancedFiltersOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="advanced-filters-toggle"
                  aria-expanded={advancedFiltersOpen}
                  aria-controls="advanced-filter-content"
                  onClick={() => setAdvancedFiltersOpen((open) => !open)}
                >
                  <span className="advanced-filters-chevron" aria-hidden="true">▶</span>
                  Advanced filters
                </button>

                <div
                  id="advanced-filter-content"
                  className="advanced-filter-content"
                  aria-hidden={!advancedFiltersOpen}
                >
                  <div className="advanced-filter-grid">
                    <label className="filter-field"><span>Minimum rating</span><select value={minRating} onChange={(event) => setMinRating(event.target.value)}><option value="">Any rating</option><option value="2">2.0+</option><option value="3">3.0+</option><option value="3.5">3.5+</option><option value="4">4.0+</option><option value="4.5">4.5+</option></select></label>
                    <label className="filter-field"><span>Maximum rating</span><select value={maxRating} onChange={(event) => setMaxRating(event.target.value)}><option value="">Any rating</option><option value="2">Up to 2.0</option><option value="3">Up to 3.0</option><option value="3.5">Up to 3.5</option><option value="4">Up to 4.0</option><option value="4.5">Up to 4.5</option><option value="5">Up to 5.0</option></select></label>
                    <label className="filter-field"><span>Starting year</span><input type="number" min="1700" max="2027" value={yearFrom} placeholder="1900" onChange={(event) => setYearFrom(event.target.value)} /></label>
                    <label className="filter-field"><span>Ending year</span><input type="number" min="1700" max="2027" value={yearTo} placeholder="2027" onChange={(event) => setYearTo(event.target.value)} /></label>
                  </div>
                </div>
              </div>
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

        <section className="discovery-panel" aria-labelledby="discovery-heading">
          <div className="discovery-heading-row">
          <button
            type="button"
            className="discovery-toggle"
            aria-expanded={discoveryOpen}
            aria-controls="discovery-content"
            onClick={() => setDiscoveryOpen((isOpen) => !isOpen)}
          >
            <div>
              <p className="discovery-kicker" data-text="AI fragrance discovery">
                AI fragrance discovery
              </p>
              <h2 id="discovery-heading">What are you in the mood for?</h2>
            </div>
            <span className="discovery-chevron" aria-hidden="true">
              <span className="discovery-chevron-icon">⌄</span>
            </span>
          </button>
          </div>

          {hasDiscoveryRun && discoveryOpen && (
            <button
              type="button"
              className="discovery-reset"
              aria-label="Clear AI discovery"
              onClick={resetDiscovery}
            >
              <span aria-hidden="true">×</span>
              Reset
            </button>
          )}

          <div
            id="discovery-content"
            className={`discovery-content ${discoveryOpen ? 'is-open' : ''}`}
            aria-hidden={!discoveryOpen}
          >
          <form className="discovery-form" onSubmit={handleDiscoverySubmit}>
            <label className="sr-only" htmlFor="discovery-prompt">
              Describe the fragrance you want
            </label>
            <textarea
              id="discovery-prompt"
              value={discoveryPrompt}
              onChange={(event) => setDiscoveryPrompt(event.target.value)}
              placeholder={
                discoveryResult?.follow_up_question
                  ? discoveryResult.follow_up_question
                  : 'Sweet for nighttime, fresh for summer, a woody scent for autumn...'
              }
              rows={2}
              maxLength={600}
            />
            <button type="submit" disabled={discoveryLoading || discoveryPrompt.trim().length < 3}>
              {discoveryLoading ? 'Finding matches…' : discoveryResult?.follow_up_question ? 'Continue' : 'Discover'}
            </button>
          </form>

          {!discoveryResult && !discoveryLoading && (
            <div className="discovery-examples" aria-label="Discovery examples">
              {discoveryExamples.map((example) => (
                <button key={example} type="button" onClick={() => startDiscoveryExample(example)}>
                  {example}
                </button>
              ))}
              <button
                type="button"
                className="discovery-examples-refresh"
                aria-label="Refresh suggested prompts"
                title="Show different suggestions"
                onClick={() =>
                  setDiscoveryExamples((current) =>
                    chooseDiscoveryPrompts(current),
                  )
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                  <path d="M20 4v7h-7" />
                </svg>
              </button>
            </div>
          )}

          {discoveryError && <p className="discovery-error" role="alert">{discoveryError}</p>}
          {discoveryResult?.follow_up_question && <p className="discovery-follow-up" role="status">{discoveryResult.follow_up_question}</p>}
          {discoveryResult?.message && <p className="discovery-message" role="status">{discoveryResult.message}</p>}

          {discoveryResult && !discoveryResult.follow_up_question && (
            <div className="discovery-results" aria-live="polite">
              {getDiscoveryPreferenceChips(discoveryResult.preferences).length > 0 && (
                <div className="discovery-preferences" aria-label="FragFriend understood">
                  <span>{discoveryPreferencesLoading ? 'Updating search' : 'FragFriend understood'}</span>
                  <div>
                    {getDiscoveryPreferenceChips(discoveryResult.preferences).map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        disabled={loading || discoveryLoading || discoveryPreferencesLoading}
                        aria-label={`Remove ${chip.label} preference`}
                        onClick={() => void removeAppliedDiscoveryPreference(chip.key)}
                      >
                        {chip.label}
                        <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </section>

        {error && <p className="error-message">{error}</p>}
      </section>

      <section
        className="results"
        aria-live="polite"
        hidden={appView !== 'search'}
      >
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

        {showingBrandResults && brands.length > 0 && (
          <div className="results-toolbar">
            <div>
              <p className="results-label">Brand results</p>

              <p className="results-page">
                Page {currentPage} of {totalPages} ·{' '}
                {totalResults.toLocaleString()}{' '}
                {totalResults === 1 ? 'brand' : 'brands'}
              </p>
            </div>

            <label className="sort-control">
              <span>Sort by</span>

              <select
                value={brandSortOption}
                disabled={loading}
                onChange={(event) =>
                  void changeBrandSort(
                    event.target.value as BrandSortOption,
                  )
                }
              >
                <option value="count-desc">
                  Most matching fragrances
                </option>
                <option value="rating-desc">
                  Highest-rated established brands
                </option>
                <option value="name-asc">
                  Brand name A–Z
                </option>
              </select>
            </label>
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

        {(searchMode === 'name' || selectedBrand) && fragrances.map((fragrance, index) => (
          <article className="fragrance-card" key={fragrance.id}>
            {matchReasons[fragrance.id]?.length > 0 && <aside className={`search-ai-bubble ${index % 4 < 2 ? 'search-ai-bubble-left' : ''}`} aria-label="Why this matches"><strong>Why this matches</strong>{matchReasons[fragrance.id].map(reason => <p key={reason}>{reason}</p>)}</aside>}
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
            <p className="card-rating">
              Rating:{' '}
              {fragrance.rating_value !== null
                ? fragrance.rating_value.toFixed(2)
                : 'Not rated'}

              {fragrance.rating_count !== null && (
                <span className="card-vote-count">
                  {' '}
                  ({fragrance.rating_count.toLocaleString()} votes)
                </span>
              )}
            </p>

            <button
              type="button"
              className="card-action"
              onClick={() => openFragranceDetails(fragrance.id, matchReasons[fragrance.id] || [])}
            >
              View more info →
            </button>
          </article>
        ))}

        {((showingBrandResults && brands.length > 0) ||
          ((searchMode === 'name' || selectedBrand) &&
            fragrances.length > 0)) && (
            <nav
              className="pagination"
              aria-label={
                showingBrandResults
                  ? 'Brand result pages'
                  : 'Fragrance result pages'
              }
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

      <section
        className="saved-library"
        hidden={appView !== 'saved'}
        aria-labelledby="saved-library-title"
      >
        <div className="saved-library-header">
          <div>
            <p className="eyebrow">Your Library</p>
            <h2 id="saved-library-title">
              Saved Fragrances
            </h2>
          </div>

          <div
            className="saved-tabs"
            role="tablist"
            aria-label="Saved fragrance views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={savedTab === 'all'}
              className={
                savedTab === 'all' ? 'is-active' : ''
              }
              onClick={() => setSavedTab('all')}
            >
              All
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={savedTab === 'collections'}
              className={
                savedTab === 'collections'
                  ? 'is-active'
                  : ''
              }
              onClick={() => void openCollectionsTab()}
            >
              Collections
            </button>
          </div>
        </div>

        <div className="library-limit-row" aria-live="polite">
          <p className="library-limit-count">
            {savedTab === 'all'
              ? `${savedFragrances.length} / ${SAVED_FRAGRANCE_LIMIT} Saved`
              : `${collections.length} / ${COLLECTION_LIMIT} Collections`}
          </p>
        </div>

        {savedTab === 'all' && (
          <>
            {savedLoading && (
              <p className="saved-message">
                Loading your saved fragrances...
              </p>
            )}

            {!savedLoading && savedError && (
              <p
                className="saved-message saved-error"
                role="alert"
              >
                {savedError}
              </p>
            )}

            {!savedLoading &&
              !savedError &&
              savedFragrances.length === 0 && (
                <p className="saved-message">
                  You haven’t saved any fragrances yet.
                </p>
              )}

            {!savedLoading &&
              !savedError &&
              savedFragrances.length > 0 && (
                <div className="saved-grid">
                  {savedFragrances.map((fragrance) => (
                    <article
                      className="fragrance-card"
                      key={fragrance.id}
                    >
                      <button
                        type="button"
                        className="saved-remove-action"
                        aria-label={`Remove ${fragrance.perfume} from Saved`}
                        onClick={() => {
                          setSavedRemovalError('')
                          setSavedRemovalTarget(fragrance)
                        }}
                      >
                        −
                      </button>
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
                            <span>
                              {fragrance.brand.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>

                      <p className="brand">
                        {fragrance.brand}
                      </p>
                      <h2>{fragrance.perfume}</h2>
                      <p>
                        {fragrance.year ?? 'Year unknown'} ·{' '}
                        {fragrance.gender ?? 'Unisex'}
                      </p>
                      <p className="card-rating">
                        Rating:{' '}
                        {fragrance.rating_value !== null
                          ? fragrance.rating_value.toFixed(2)
                          : 'Not rated'}

                        {fragrance.rating_count !== null && (
                          <span className="card-vote-count">
                            {' '}
                            ({fragrance.rating_count.toLocaleString()} votes)
                          </span>
                        )}
                      </p>

                      <button
                        type="button"
                        className="card-action"
                        onClick={() =>
                          openFragranceDetails(fragrance.id)
                        }
                      >
                        View more info →
                      </button>
                    </article>
                  ))}
                </div>
              )}
          </>
        )}

        {savedTab === 'collections' && (
          <>
            <div className="collection-actions">
              <button
                type="button"
                disabled={collections.length >= COLLECTION_LIMIT}
                onClick={() => {
                  setCollectionFormError('')
                  setCollectionFormOpen(true)
                }}
              >
                {collections.length >= COLLECTION_LIMIT
                  ? 'Collection limit reached'
                  : '+ New collection'}
              </button>
            </div>

            {collections.length >= COLLECTION_LIMIT && (
              <p className="collection-limit-message" role="status">
                Delete a collection before creating another.
              </p>
            )}

            {collectionFormOpen && (
              <form
                className="collection-form"
                onSubmit={handleCreateCollection}
              >
                <div className="collection-form-heading">
                  <div>
                    <p className="eyebrow">
                      New collection
                    </p>
                    <h3>Create a collection</h3>
                  </div>

                  <button
                    type="button"
                    className="collection-form-close"
                    aria-label="Close collection form"
                    onClick={() => {
                      setCollectionFormOpen(false)
                      setCollectionFormError('')
                    }}
                  >
                    ×
                  </button>
                </div>

                <label>
                  Collection name
                  <input
                    type="text"
                    value={collectionName}
                    maxLength={80}
                    placeholder="Date Night"
                    onChange={(event) =>
                      setCollectionName(
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  Description
                  <textarea
                    value={collectionDescription}
                    maxLength={240}
                    placeholder="Fragrances for evenings and special occasions"
                    onChange={(event) =>
                      setCollectionDescription(
                        event.target.value,
                      )
                    }
                  />
                </label>

                {collectionFormError && (
                  <p
                    className="collection-form-error"
                    role="alert"
                  >
                    {collectionFormError}
                  </p>
                )}

                <div className="collection-form-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setCollectionFormOpen(false)
                      setCollectionFormError('')
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={collectionSubmitting}
                  >
                    {collectionSubmitting
                      ? 'Creating...'
                      : 'Create collection'}
                  </button>
                </div>
              </form>
            )}

            {collectionsLoading && (
              <p className="saved-message">
                Loading your collections...
              </p>
            )}

            {!collectionsLoading && collectionsError && (
              <p
                className="saved-message saved-error"
                role="alert"
              >
                {collectionsError}
              </p>
            )}

            {!collectionsLoading &&
              !collectionsError &&
              collections.length === 0 && (
                <p className="saved-message">
                  Create your first collection to organize
                  fragrances by mood, season, occasion, or
                  anything else.
                </p>
              )}

            {!collectionsLoading &&
              !collectionsError &&
              collections.length > 0 && (
                <div className="collection-grid">
                  {collections.map((collection) => (
                    <button
                      type="button"
                      className="collection-card"
                      key={collection.id}
                      onClick={() =>
                        void openCollection(collection.id)
                      }
                    >
                      <p className="eyebrow">
                        Collection
                      </p>
                      <h3>{collection.name}</h3>

                      {collection.description && (
                        <p>{collection.description}</p>
                      )}

                      <p className="collection-count">
                        {collection.fragrance_count}{' '}
                        {collection.fragrance_count === 1
                          ? 'Fragrance'
                          : 'Fragrances'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
          </>
        )}
      </section>
      </div>
      {(selectedCollectionLoading ||
        selectedCollectionError ||
        selectedCollection) && (
        <div
          className="detail-backdrop"
          onClick={closeCollection}
        >
          <section
            className="detail-modal collection-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="detail-close"
              aria-label="Close collection"
              onClick={closeCollection}
            >
              ×
            </button>

            {selectedCollectionLoading && (
              <p className="detail-status">
                Loading collection…
              </p>
            )}

            {!selectedCollectionLoading &&
              selectedCollectionError && (
                <p className="detail-error">
                  {selectedCollectionError}
                </p>
              )}

            {!selectedCollectionLoading &&
              selectedCollection && (
                <>
                  <header className="collection-detail-header">
                    <p className="eyebrow">Collection</p>
                    {collectionEditing ? (
                      <form
                        className="collection-edit-form"
                        onSubmit={saveSelectedCollection}
                      >
                        <label htmlFor="collection-edit-name">
                          Collection name
                        </label>
                        <input
                          id="collection-edit-name"
                          type="text"
                          value={collectionEditName}
                          maxLength={80}
                          autoFocus
                          onChange={(event) =>
                            setCollectionEditName(event.target.value)
                          }
                        />
                        <label htmlFor="collection-edit-description">
                          Description
                        </label>
                        <textarea
                          id="collection-edit-description"
                          value={collectionEditDescription}
                          maxLength={240}
                          placeholder="Add a collection description"
                          onChange={(event) =>
                            setCollectionEditDescription(event.target.value)
                          }
                        />
                        {collectionEditError && (
                          <p className="collection-form-error" role="alert">
                            {collectionEditError}
                          </p>
                        )}
                        <div className="collection-edit-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setCollectionEditName(selectedCollection.name)
                              setCollectionEditDescription(selectedCollection.description || '')
                              setCollectionEditError('')
                              setCollectionEditing(false)
                            }}
                            disabled={collectionEditSaving}
                          >
                            Cancel
                          </button>
                          <button type="submit" disabled={collectionEditSaving}>
                            {collectionEditSaving ? 'Saving…' : 'Save changes'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="collection-title-row">
                          <h2 id="collection-detail-title">
                            {selectedCollection.name}
                          </h2>
                          <button
                            type="button"
                            className="collection-edit-button"
                            onClick={() => setCollectionEditing(true)}
                          >
                            Edit
                          </button>
                        </div>
                        <p className={selectedCollection.description ? '' : 'collection-empty-description'}>
                          {selectedCollection.description || 'Add a collection description'}
                        </p>
                      </>
                    )}

                    <p className="collection-count">
                      {selectedCollection.fragrances.length}{' '}
                      {selectedCollection.fragrances.length === 1
                        ? 'Fragrance'
                        : 'Fragrances'}
                    </p>
                    <button
                      type="button"
                      className="collection-delete-button"
                      onClick={() => setCollectionDeleteConfirmOpen(true)}
                      disabled={collectionDeleting}
                    >
                      {collectionDeleting
                        ? 'Deleting...'
                        : 'Delete collection'}
                    </button>
                  </header>

                  {collectionDeleteConfirmOpen && (
                    <div
                      className="collection-delete-backdrop"
                      onClick={() => setCollectionDeleteConfirmOpen(false)}
                    >
                      <section
                        className="collection-delete-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="delete-collection-title"
                        aria-describedby="delete-collection-description"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="eyebrow">Delete collection</p>
                        <h3 id="delete-collection-title">
                          Are you sure you want to delete this collection?
                        </h3>
                        <p id="delete-collection-description">
                          “{selectedCollection.name}” will be removed. Its fragrances will remain in All saved fragrances.
                        </p>
                        <div className="collection-delete-actions">
                          <button type="button" onClick={() => setCollectionDeleteConfirmOpen(false)} disabled={collectionDeleting}>
                            Cancel
                          </button>
                          <button type="button" className="confirm-collection-delete" onClick={() => void confirmDeleteSelectedCollection()} disabled={collectionDeleting}>
                            {collectionDeleting ? 'Deleting…' : 'Delete collection'}
                          </button>
                        </div>
                      </section>
                    </div>
                  )}

                  {selectedCollection.fragrances.length === 0 ? (
                    <p className="saved-message">
                      This collection does not contain any
                      fragrances yet.
                    </p>
                  ) : (
                    <div className="saved-grid collection-detail-grid">
                      {selectedCollection.fragrances.map(
                        (fragrance) => (
                          <article
                            className="fragrance-card"
                            key={fragrance.id}
                          >
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
                                  <span>
                                    {fragrance.brand.charAt(0)}
                                  </span>
                                </div>
                              )}
                            </div>

                            <p className="brand">
                              {fragrance.brand}
                            </p>
                            <h2>{fragrance.perfume}</h2>
                            <p>
                              {fragrance.year ?? 'Year unknown'} ·{' '}
                              {fragrance.gender ?? 'Unisex'}
                            </p>
                            <p className="card-rating">
                              Rating:{' '}
                              {fragrance.rating_value !== null
                                ? fragrance.rating_value.toFixed(2)
                                : 'Not rated'}

                              {fragrance.rating_count !== null && (
                                <span className="card-vote-count">
                                  {' '}
                                  ({fragrance.rating_count.toLocaleString()} votes)
                                </span>
                              )}
                            </p>

                            <div className="collection-fragrance-actions">
                              <button
                                type="button"
                                className="card-action"
                                onClick={() =>
                                  openFragranceDetails(
                                    fragrance.id,
                                  )
                                }
                              >
                                View more info →
                              </button>

                              <button
                                type="button"
                                className="collection-remove-action"
                                onClick={() =>
                                  void removeSelectedCollectionFragrance(
                                    fragrance.id,
                                  )
                                }
                                disabled={
                                  collectionActionLoadingId !== null
                                }
                              >
                                {collectionActionLoadingId ===
                                fragrance.id
                                  ? 'Removing...'
                                  : 'Remove'}
                              </button>
                            </div>
                          </article>
                        ),
                      )}
                    </div>
                  )}
                </>
              )}
          </section>
        </div>
      )}
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

                  {selectedDiscoveryReasons.length > 0 && (
                    <section className="detail-ai-reasoning" aria-label="Why FragFriend chose this fragrance">
                      <p>Why FragFriend chose this</p>
                      <ul>
                        {selectedDiscoveryReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                <div className="detail-save-actions">
                  <div className="detail-bookmark-area">
                    <button
                      type="button"
                      className={`detail-bookmark-button${
                        isBookmarked ? ' is-bookmarked' : ''
                      }`}
                      onClick={toggleSelectedFragranceBookmark}
                      disabled={bookmarkLoading}
                    >
                      {!currentUser
                        ? 'Sign in to save'
                        : bookmarkLoading
                          ? isBookmarked
                            ? 'Removing...'
                            : 'Saving...'
                          : isBookmarked
                            ? 'Saved ✓'
                            : 'Save fragrance'}
                    </button>

                    {bookmarkError && (
                      <p
                        className="detail-bookmark-error"
                        role="alert"
                      >
                        {bookmarkError}
                      </p>
                    )}
                  </div>

                  <div className="detail-collection-area">
                    <button
                      type="button"
                      className="detail-collection-button"
                      onClick={() => {
                        if (collectionPickerOpen) {
                          setCollectionPickerOpen(false)
                          setCollectionActionError('')
                          setCollectionActionMessage('')
                        } else {
                          void openCollectionPicker()
                        }
                      }}
                    >
                      {collectionPickerOpen
                        ? 'Close collections'
                        : 'Add to collection'}
                    </button>

                    {collectionPickerOpen && (
                      <div className="detail-collection-picker">
                        <h3>Choose a collection</h3>

                        {collectionsLoading && (
                          <p>Loading collections...</p>
                        )}

                        {!collectionsLoading &&
                          collectionActionError && (
                            <p
                              className="detail-collection-error"
                              role="alert"
                            >
                              {collectionActionError}
                            </p>
                          )}

                        {!collectionsLoading &&
                          !collectionActionError &&
                          collections.length === 0 && (
                            <p>
                              You have no collections yet. Create one
                              from Saved → Collections.
                            </p>
                          )}

                        {!collectionsLoading &&
                          collections.length > 0 && (
                            <div className="detail-collection-list">
                              {collections.map((collection) => (
                                <button
                                  key={collection.id}
                                  type="button"
                                  onClick={() =>
                                    void addSelectedFragranceToCollection(
                                      collection.id,
                                    )
                                  }
                                  disabled={
                                    collectionActionLoadingId !== null
                                  }
                                >
                                  <span>{collection.name}</span>
                                  <span>
                                    {collectionActionLoadingId ===
                                    collection.id
                                      ? 'Adding...'
                                      : `${collection.fragrance_count} saved`}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                        {collectionActionMessage && (
                          <p
                            className="detail-collection-success"
                            role="status"
                          >
                            {collectionActionMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  </div>

                  {selectedFragrance.flat_notes && (
                    <div className="detail-notes">
                      <div>
                        <h3>Notes (pyramid not specified)</h3>
                        <p>{toScentTitle(selectedFragrance.flat_notes)}</p>
                      </div>
                    </div>
                  )}

                  {(selectedFragrance.top_notes || selectedFragrance.middle_notes ||
                    selectedFragrance.base_notes || !selectedFragrance.flat_notes) && (
                  <div className="detail-notes">
                    <div>
                      <h3>Top notes</h3>
                      <p>{selectedFragrance.top_notes ? toScentTitle(selectedFragrance.top_notes) : 'Not listed'}</p>
                    </div>

                    <div>
                      <h3>Middle notes</h3>
                      <p>{selectedFragrance.middle_notes ? toScentTitle(selectedFragrance.middle_notes) : 'Not listed'}</p>
                    </div>

                    <div>
                      <h3>Base notes</h3>
                      <p>{selectedFragrance.base_notes ? toScentTitle(selectedFragrance.base_notes) : 'Not listed'}</p>
                    </div>
                  </div>

                  )}

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
                          <span key={accord}>
                            {toScentTitle(accord)}
                          </span>
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
      {authModalOpen && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
      {savedRemovalTarget && (
        <div className="saved-remove-backdrop" onClick={() => !savedRemovalLoading && setSavedRemovalTarget(null)}>
          <section className="saved-remove-dialog" role="alertdialog" aria-modal="true" aria-labelledby="saved-remove-title" aria-describedby="saved-remove-description" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Remove fragrance</p>
            <h2 id="saved-remove-title">Remove from Saved fragrances?</h2>
            <p id="saved-remove-description">“{savedRemovalTarget.perfume}” will be removed from Saved fragrances and every collection it belongs to.</p>
            {savedRemovalError && <p className="saved-remove-error" role="alert">{savedRemovalError}</p>}
            <div className="saved-remove-actions">
              <button type="button" onClick={() => setSavedRemovalTarget(null)} disabled={savedRemovalLoading}>Cancel</button>
              <button type="button" className="confirm-saved-remove" onClick={() => void confirmSavedFragranceRemoval()} disabled={savedRemovalLoading}>
                {savedRemovalLoading ? 'Removing…' : 'Remove fragrance'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
