export interface CardViewPluginSettings {
    defaultView: 'card' | 'list' | 'timeline' | 'month';
    cardWidth: number;
    minCardWidth: number;
    maxCardWidth: number;
    showTagCount: boolean;
    cardHeight: number;
    minCardHeight: number;
    maxCardHeight: number;
}

export const DEFAULT_SETTINGS: CardViewPluginSettings = {
    defaultView: 'card',
    cardWidth: 280,
    minCardWidth: 200,
    maxCardWidth: 800,
    showTagCount: true,
    cardHeight: 280,
    minCardHeight: 200,
    maxCardHeight: 800
}; 