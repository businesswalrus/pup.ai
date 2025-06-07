import axios from 'axios';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  private apiKey?: string;
  private searchEngineId?: string;

  constructor() {
    // Google Custom Search API credentials
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  }

  async search(query: string, options: {
    numResults?: number;
    site?: string;
  } = {}): Promise<WebSearchResult[]> {
    // If no Google API configured, use a simple web scraping approach
    if (!this.apiKey || !this.searchEngineId) {
      return this.fallbackSearch(query, options);
    }

    try {
      const url = 'https://www.googleapis.com/customsearch/v1';
      const params = {
        key: this.apiKey,
        cx: this.searchEngineId,
        q: options.site ? `site:${options.site} ${query}` : query,
        num: options.numResults || 5
      };

      const response = await axios.get(url, { params });
      
      return response.data.items?.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet
      })) || [];
    } catch (error) {
      console.error('Google search error:', error);
      return this.fallbackSearch(query, options);
    }
  }

  private async fallbackSearch(query: string, options: {
    numResults?: number;
    site?: string;
  } = {}): Promise<WebSearchResult[]> {
    // For NBA stats, we can directly construct Basketball Reference URLs
    if (query.toLowerCase().includes('nba') || query.toLowerCase().includes('basketball')) {
      const results: WebSearchResult[] = [];
      
      // Common NBA stats sites
      const sites = [
        {
          name: 'Basketball Reference',
          baseUrl: 'https://www.basketball-reference.com',
          searchPath: '/search/search.fcgi?search='
        },
        {
          name: 'NBA.com Stats',
          baseUrl: 'https://www.nba.com/stats',
          searchPath: '/search?q='
        },
        {
          name: 'ESPN NBA',
          baseUrl: 'https://www.espn.com/nba',
          searchPath: '/search/_/q/'
        }
      ];

      // Create search results for known NBA stats sites
      for (const site of sites) {
        results.push({
          title: `${query} - ${site.name}`,
          url: `${site.baseUrl}${site.searchPath}${encodeURIComponent(query)}`,
          snippet: `Search for "${query}" on ${site.name}`
        });
      }

      return results.slice(0, options.numResults || 5);
    }

    // For other queries, provide a helpful message about needing Google API
    console.warn('Non-NBA web search attempted without Google API configured');
    return [{
      title: 'Web search requires Google API configuration',
      url: 'https://developers.google.com/custom-search/v1/introduction',
      snippet: `To search for "${query}", please configure GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your environment variables.`
    }];
  }

  async fetchPage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PupAI/1.0; +http://pup.ai)'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching page:', error);
      throw new Error('Failed to fetch web page');
    }
  }
}

// NBA-specific search helper
export async function searchNBAStats(playerOrTeam: string, statType?: string): Promise<WebSearchResult[]> {
  const searchService = new WebSearchService();
  
  let query = playerOrTeam;
  if (statType) {
    query += ` ${statType}`;
  }
  
  // Search specifically on Basketball Reference
  return searchService.search(query, {
    site: 'basketball-reference.com',
    numResults: 3
  });
}