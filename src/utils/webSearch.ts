import axios from 'axios';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  private apiKey?: string;
  private searchEngineId?: string;
  private braveApiKey?: string;
  private serpApiKey?: string;
  
  // Comprehensive patterns that indicate a search is needed
  private searchTriggers = [
    // Current events and news
    /what.*(happening|going on|news|latest)/i,
    /\b(current|today|yesterday|now|latest|recent|this week|last night)\b/i,
    /\b(news about|update on|announcement|breaking)\b/i,
    
    // Sports queries
    /\b(who won|who is winning|score|game|match|championship|finals|playoff)\b/i,
    /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey)\b.*\b(game|score|match|result|winner)\b/i,
    /\b(game|match|championship|tournament|finals).*\b(tonight|today|yesterday|last night)\b/i,
    
    // Weather
    /\b(weather|temperature|forecast|rain|snow|storm)\b/i,
    
    // Financial/Market
    /\b(stock|price|market|crypto|bitcoin|dow|nasdaq|s&p)\b/i,
    
    // Time-sensitive questions
    /\b(when is|when does|when will|what time)\b/i,
    /\b(how much is|what is the price|cost of)\b/i,
    
    // Facts that change over time
    /\b(president|prime minister|leader|government)\b.*\b(current|now|today)\b/i,
    /\b(population|statistics|data|numbers).*\b(current|latest|2024|2025)\b/i,
    
    // Specific year mentions (likely time-sensitive)
    /\b(202[4-9]|203\d)\b/,
    
    // Question words with temporal context
    /^(what|who|where|when|how|why).*\b(today|now|current|latest)\b/i,
  ];

  constructor() {
    // Multiple search provider support
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    this.braveApiKey = process.env.BRAVE_API_KEY || process.env.SEARCH_API_KEY;
    this.serpApiKey = process.env.SERPAPI_KEY;
  }
  
  /**
   * Determine if a message requires web search
   */
  shouldSearch(message: string): boolean {
    // Always search for questions about current events
    const isQuestion = message.includes('?');
    
    // Check if any trigger patterns match
    const matchesTrigger = this.searchTriggers.some(pattern => pattern.test(message));
    
    // Log decision for debugging
    if (matchesTrigger) {
      console.log('[WebSearch] Query requires search:', {
        message: message.substring(0, 100),
        isQuestion,
        matchesTrigger
      });
    }
    
    return matchesTrigger;
  }

  async search(
    query: string,
    options: {
      numResults?: number;
      site?: string;
    } = {}
  ): Promise<WebSearchResult[]> {
    try {
      console.log(`[WebSearch] Searching for: ${query}`);
      
      // Enhance query with temporal context
      const enhancedQuery = this.enhanceQuery(query);
      
      // Try search providers in order of preference
      let results: WebSearchResult[] = [];
      
      // 1. Try Brave Search first (if configured)
      if (this.braveApiKey) {
        results = await this.braveSearch(enhancedQuery, options);
      }
      
      // 2. Try Google Custom Search
      if (results.length === 0 && this.apiKey && this.searchEngineId) {
        results = await this.googleSearch(enhancedQuery, options);
      }
      
      // 3. Try SerpAPI
      if (results.length === 0 && this.serpApiKey) {
        results = await this.serpApiSearch(enhancedQuery, options);
      }
      
      // 4. Fall back to direct URL construction
      if (results.length === 0) {
        results = await this.fallbackSearch(query, options);
      }
      
      console.log(`[WebSearch] Found ${results.length} results`);
      return results;
      
    } catch (error) {
      console.error('[WebSearch] Search failed:', error);
      return this.fallbackSearch(query, options);
    }
  }
  
  /**
   * Enhance query with temporal context
   */
  private enhanceQuery(query: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.toLocaleString('default', { month: 'long' });
    const day = now.getDate();
    
    // Add current date context for very time-sensitive queries
    if (/\b(today|tonight|right now)\b/i.test(query) && !query.includes(year.toString())) {
      return `${query} ${month} ${day} ${year}`;
    }
    
    // Add year for recent queries
    if (/\b(latest|recent|current|this week|yesterday)\b/i.test(query) && !query.includes(year.toString())) {
      return `${query} ${year}`;
    }
    
    // Add month and year for semi-recent queries
    if (/\b(this month|last month)\b/i.test(query)) {
      return `${query} ${month} ${year}`;
    }
    
    return query;
  }
  
  /**
   * Brave Search implementation
   */
  private async braveSearch(query: string, options: any): Promise<WebSearchResult[]> {
    try {
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
          'X-Subscription-Token': this.braveApiKey,
          'Accept': 'application/json'
        },
        params: {
          q: query,
          count: options.numResults || 5,
          freshness: 'pw' // Past week for recent results
        }
      });
      
      const results = response.data.web?.results || [];
      return results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.description || r.snippet || ''
      }));
    } catch (error) {
      console.error('[WebSearch] Brave search error:', error);
      return [];
    }
  }
  
  /**
   * Google Custom Search implementation
   */
  private async googleSearch(query: string, options: any): Promise<WebSearchResult[]> {
    try {
      const params = {
        key: this.apiKey,
        cx: this.searchEngineId,
        q: options.site ? `site:${options.site} ${query}` : query,
        num: options.numResults || 5,
        dateRestrict: 'd30', // Last 30 days
        sort: 'date' // Most recent first
      };

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });

      return (
        response.data.items?.map((item: any) => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        })) || []
      );
    } catch (error) {
      console.error('[WebSearch] Google search error:', error);
      return [];
    }
  }
  
  /**
   * SerpAPI implementation
   */
  private async serpApiSearch(query: string, options: any): Promise<WebSearchResult[]> {
    try {
      const params = {
        api_key: this.serpApiKey,
        q: query,
        num: options.numResults || 5,
        engine: 'google',
        tbs: 'qdr:m' // Last month
      };
      
      const response = await axios.get('https://serpapi.com/search', { params });
      
      const results = response.data.organic_results || [];
      return results.map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet
      }));
    } catch (error) {
      console.error('[WebSearch] SerpAPI error:', error);
      return [];
    }
  }

  private async fallbackSearch(
    query: string,
    options: {
      numResults?: number;
      site?: string;
    } = {}
  ): Promise<WebSearchResult[]> {
    // For NBA stats, we can directly construct Basketball Reference URLs
    if (query.toLowerCase().includes('nba') || query.toLowerCase().includes('basketball')) {
      const results: WebSearchResult[] = [];

      // Common NBA stats sites
      const sites = [
        {
          name: 'Basketball Reference',
          baseUrl: 'https://www.basketball-reference.com',
          searchPath: '/search/search.fcgi?search=',
        },
        {
          name: 'NBA.com Stats',
          baseUrl: 'https://www.nba.com/stats',
          searchPath: '/search?q=',
        },
        {
          name: 'ESPN NBA',
          baseUrl: 'https://www.espn.com/nba',
          searchPath: '/search/_/q/',
        },
      ];

      // Create search results for known NBA stats sites
      for (const site of sites) {
        results.push({
          title: `${query} - ${site.name}`,
          url: `${site.baseUrl}${site.searchPath}${encodeURIComponent(query)}`,
          snippet: `Search for "${query}" on ${site.name}`,
        });
      }

      return results.slice(0, options.numResults || 5);
    }

    // For other queries, provide a helpful message about needing Google API
    console.warn('Non-NBA web search attempted without Google API configured');
    return [
      {
        title: 'Web search requires Google API configuration',
        url: 'https://developers.google.com/custom-search/v1/introduction',
        snippet: `To search for "${query}", please configure GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your environment variables.`,
      },
    ];
  }

  async fetchPage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PupAI/1.0; +http://pup.ai)',
        },
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching page:', error);
      throw new Error('Failed to fetch web page');
    }
  }
}

// NBA-specific search helper
export async function searchNBAStats(
  playerOrTeam: string,
  statType?: string
): Promise<WebSearchResult[]> {
  const searchService = new WebSearchService();

  let query = playerOrTeam;
  if (statType) {
    query += ` ${statType}`;
  }

  // Search specifically on Basketball Reference
  return searchService.search(query, {
    site: 'basketball-reference.com',
    numResults: 3,
  });
}
