import puppeteer from 'puppeteer';

export interface ParsedServiceRow {
  sourceCategoryName: string;
  sourceTreatmentName: string;
  normalizedTreatmentName: string;
  sourcePriceText: string;
  numericPrice: number;
  currency: string;
  sourceDurationText: string;
  durationValue: number;
  durationUnit: string;
  sourceUrl: string;
  sourceCategoryIndex: number;
  sourceRowIndex: number;
}

export interface ParserMetrics {
  detectedCategoryCount: number;
  expandedCategoryCount: number;
  detectedVisibleTreatmentRowCount: number;
  parsedTreatmentRowCount: number;
  validPriceCount: number;
  validDurationCount: number;
  ignoredHeaderCount: number;
  duplicateDomRowCount: number;
  unparseableRowCount: number;
}

export interface ParseResult {
  metrics: ParserMetrics;
  rows: ParsedServiceRow[];
}

export async function parsePricesAndServices(url: string): Promise<ParseResult> {
  const browser = await puppeteer.launch({ 
      headless: true, 
      channel: 'chrome' // Uses the local system Chrome, avoiding downloading corrupted binaries
  });
  const page = await browser.newPage();
  
  // Set user agent and bypass bot checks optionally
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (err) {
    console.error("Failed to load page or timed out, continuing with whatever is loaded.", err);
  }

  // Inject a small script to find the Prices & Services container
  const rootContainerSelector = await page.evaluate(function() {
    // 1. Find the section
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const sectionKeywords = ['Prices & Services', 'Price and Services', 'Pricing & Services', 'Treatments & Prices', 'Services & Prices', 'Ücretler ve Hizmetler', 'Ücret ve Hizmetler', 'Fiyatlar ve Hizmetler', 'Tedaviler ve Fiyatlar'];
    
    let targetHeading = headings.find(h => {
      const t = h.textContent ? h.textContent.trim() : '';
      return sectionKeywords.some(k => t.toLowerCase() === k.toLowerCase());
    });
    
    if (!targetHeading) {
      const texts = Array.from(document.querySelectorAll('*'))
         .filter(el => Array.from(el.childNodes).some(child => child.nodeType === Node.TEXT_NODE && sectionKeywords.includes(child.textContent ? child.textContent.trim() : '')));
      if (texts.length > 0) {
          targetHeading = texts[texts.length - 1];
      }
    }
    
    let rootContainerSelector = 'body';
    if (targetHeading) {
       let curr = targetHeading.parentElement;
       while (curr && curr !== document.body) {
           if (curr.querySelectorAll('button, summary, [data-state]').length > 2) {
               curr.id = curr.id || 'temp-root-container';
               rootContainerSelector = '#' + curr.id;
               break;
           }
           curr = curr.parentElement;
       }
    }
    return rootContainerSelector;
  });

  // 2. Expand all accordions safely from Node.js side
  let detectedCategoryCount = 0;
  let expandedCategoryCount = 0;
  try {
      const buttons = await page.$$(`${rootContainerSelector} button, ${rootContainerSelector} [role="button"], ${rootContainerSelector} summary, ${rootContainerSelector} [data-state="closed"]`);
      detectedCategoryCount = buttons.length;
      
      for (const btn of buttons) {
          try {
              const tag = await btn.evaluate(el => el.tagName.toLowerCase());
              if (tag === 'a') continue; // skip links
              
              const text = await btn.evaluate(el => el.textContent?.trim().toLowerCase() || '');
              if (!text || text.includes('book') || text.includes('appointment')) continue;
              
              const isClosed = await btn.evaluate(el => el.getAttribute('aria-expanded') === 'false' || el.getAttribute('data-state') === 'closed' || (el.tagName.toLowerCase() === 'details' && !(el as HTMLDetailsElement).open));
              
              if (isClosed) {
                  await btn.evaluate(el => {
                      if (el.tagName.toLowerCase() === 'details') {
                          (el as HTMLDetailsElement).open = true;
                      } else {
                          (el as HTMLElement).click();
                      }
                  });
                  expandedCategoryCount++;
                  await new Promise(resolve => setTimeout(resolve, 500));
              } else {
                  expandedCategoryCount++;
              }
          } catch (e) {
              // Ignore stale element errors
          }
      }
      console.log(`Detected Categories: ${detectedCategoryCount}, Expanded: ${expandedCategoryCount}`);
  } catch (err) {
      console.log("Error during accordion expansion:", err);
  }

  const metrics = { detectedCategoryCount, expandedCategoryCount };
  
  // Wait a bit more for all DOM mutations (React state updates)
  await new Promise(resolve => setTimeout(resolve, 1000));

  const extractionResult = await page.evaluate(function(urlStr) {
    const rawRows: any[] = [];
    
    const sectionKeywords = ['Prices & Services', 'Price and Services', 'Pricing & Services', 'Treatments & Prices', 'Services & Prices', 'Ücretler ve Hizmetler', 'Ücret ve Hizmetler', 'Fiyatlar ve Hizmetler', 'Tedaviler ve Fiyatlar'];
    let targetHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(h => {
      const t = h.textContent?.trim() || '';
      return sectionKeywords.some(k => t.toLowerCase() === k.toLowerCase());
    });
    
    let rootContainer: HTMLElement = document.body;
    if (targetHeading) {
       let curr = targetHeading.parentElement;
       while (curr && curr !== document.body) {
           // A container is good if it has at least some elements that look like price rows
           if (curr.textContent?.includes('EUR') || curr.textContent?.includes('€')) {
               rootContainer = curr;
               break;
           }
           curr = curr.parentElement;
       }
    }

    // Strategy: Look for all text nodes that have a price (EUR, €, etc) and backtrack to find row boundaries.
    // Or, look for common layout patterns (like grid, flex row, tr).
    const priceElements = Array.from(rootContainer.querySelectorAll('*')).filter(el => {
        // Only get deepest elements that contain price
        if (el.children.length > 0) return false;
        const text = el.textContent?.trim() || '';
        return text.includes('EUR') || text.includes('€') || text.includes('£') || text.includes('$');
    });

    // To prevent duplicate DOM elements (desktop vs mobile views)
    const seenHashes = new Set<string>();
    
    let currentCategory = "Unknown Category";
    
    // We can also try to find the category by looking at preceding DOM elements.
    // A better approach for accordions: the parent accordion item is a good boundary.
    const accordionItems = Array.from(rootContainer.querySelectorAll('[data-state], details, .accordion-item, .category-block, [class*="accordion"]'));
    
    if (accordionItems.length > 0) {
        accordionItems.forEach((item, catIdx) => {
            // Usually the first bold text or button text is the category name
            let catName = item.querySelector('button, summary, .font-semibold, h3, h4, h5')?.textContent?.trim() || ('Category ' + catIdx);
            // Clean up cat name
            catName = catName.replace(/\n/g, '').trim();

            // Find rows inside this item. Often they are <li>, <tr>, or flex divs.
            // Let's find elements that contain a price
            const pEls = Array.from(item.querySelectorAll('*')).filter(el => {
                if (el.children.length > 0) return false;
                const text = el.textContent?.trim() || '';
                return text.includes('EUR') || text.includes('€') || /\\d+\\.\\d{2}/.test(text); // Basic price check
            });
            
            pEls.forEach((pEl, rowIdx) => {
                // Find closest row-like parent
                let rowParent = pEl.parentElement;
                while (rowParent && rowParent !== item) {
                    const t = rowParent.textContent?.trim() || '';
                    // A row usually contains the name, price, and duration.
                    if (rowParent.tagName === 'TR' || rowParent.tagName === 'LI' || (window.getComputedStyle(rowParent).display === 'flex' && rowParent.children.length >= 2)) {
                        break;
                    }
                    rowParent = rowParent.parentElement;
                }
                
                if (rowParent) {
                    const rowText = rowParent.textContent?.replace(/\s+/g, ' ').trim() || '';
                    if (seenHashes.has(rowText)) return;
                    seenHashes.add(rowText);
                    
                    // Try to extract name, price, duration
                    // We assume it's split into child elements.
                    const childrenText = Array.from(rowParent.children).map(c => c.textContent?.trim() || '').filter(t => t);
                    if (childrenText.length >= 2) {
                        let sourceTreatmentName = childrenText[0];
                        let sourcePriceText = childrenText.find(t => t.includes('EUR') || t.includes('€') || t.match(/\\d/)) || '';
                        let sourceDurationText = childrenText.find(t => t.includes('Gün') || t.includes('Day')) || '';
                        
                        // Refinement if it's 3 columns
                        if (childrenText.length === 3) {
                            sourceTreatmentName = childrenText[0];
                            sourcePriceText = childrenText[1];
                            sourceDurationText = childrenText[2];
                        }
                        
                        // Ignore headers
                        if (sourceTreatmentName.toLowerCase().includes('treatment') && sourcePriceText.toLowerCase().includes('price')) return;
                        if (sourceTreatmentName.toLowerCase().includes('tedavi') && sourcePriceText.toLowerCase().includes('ücret')) return;

                        rawRows.push({
                            sourceCategoryName: catName,
                            sourceTreatmentName,
                            sourcePriceText,
                            sourceDurationText,
                            sourceUrl: urlStr,
                            sourceCategoryIndex: catIdx,
                            sourceRowIndex: rowIdx
                        });
                    }
                }
            });
        });
    } else {
        // Fallback for flat tables or lists
        const rows = Array.from(rootContainer.querySelectorAll('tr, li, .flex-row'));
        rows.forEach((row, rowIdx) => {
             const rowText = row.textContent?.replace(/\s+/g, ' ').trim() || '';
             if (seenHashes.has(rowText)) return;
             if (!rowText.includes('EUR') && !rowText.includes('€')) return;
             
             seenHashes.add(rowText);
             const childrenText = Array.from(row.children).map(c => c.textContent?.trim() || '').filter(t => t);
             if (childrenText.length >= 2) {
                let sourceTreatmentName = childrenText[0];
                let sourcePriceText = childrenText[1];
                let sourceDurationText = childrenText[2] || '';
                
                // Try to find a preceding header for category
                let prev = row.previousElementSibling;
                while(prev) {
                    if (prev.tagName.match(/^H[1-6]$/) || prev.classList.contains('category')) {
                        currentCategory = prev.textContent?.trim() || currentCategory;
                        break;
                    }
                    prev = prev.previousElementSibling;
                }

                if (sourceTreatmentName.toLowerCase().includes('treatment') && sourcePriceText.toLowerCase().includes('price')) return;
                if (sourceTreatmentName.toLowerCase().includes('tedavi') && sourcePriceText.toLowerCase().includes('ücret')) return;

                rawRows.push({
                    sourceCategoryName: currentCategory,
                    sourceTreatmentName,
                    sourcePriceText,
                    sourceDurationText,
                    sourceUrl: urlStr,
                    sourceCategoryIndex: 0,
                    sourceRowIndex: rowIdx
                });
             }
        });
    }

    return rawRows;
  }, url);

  await browser.close();

  // Process rows in Node.js
  const finalRows: ParsedServiceRow[] = [];
  const m: ParserMetrics = {
    detectedCategoryCount: metrics.detectedCategoryCount,
    expandedCategoryCount: metrics.expandedCategoryCount,
    detectedVisibleTreatmentRowCount: extractionResult.length,
    parsedTreatmentRowCount: 0,
    validPriceCount: 0,
    validDurationCount: 0,
    ignoredHeaderCount: 0,
    duplicateDomRowCount: 0, // Hard to track across mobile/desktop exactly here, we used Set earlier.
    unparseableRowCount: 0
  };

  extractionResult.forEach(row => {
      // Clean names
      let name = row.sourceTreatmentName.replace(/\s+/g, ' ').trim();
      let priceText = row.sourcePriceText.trim();
      let durationText = row.sourceDurationText.trim();
      
      // Attempt price parsing
      let numericPrice = 0;
      let currency = 'EUR';
      
      // 3.750,00 € -> 3750.00
      // 3750.00 EUR -> 3750.00
      let cleanPrice = priceText.replace(/[^0-9.,]/g, '');
      // Handle comma vs dot
      if (cleanPrice.includes(',') && cleanPrice.includes('.')) {
          // Both exist, assume format 3.750,00 or 3,750.00
          const lastComma = cleanPrice.lastIndexOf(',');
          const lastDot = cleanPrice.lastIndexOf('.');
          if (lastComma > lastDot) {
              // 3.750,00
              cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
          } else {
              // 3,750.00
              cleanPrice = cleanPrice.replace(/,/g, '');
          }
      } else if (cleanPrice.includes(',')) {
          cleanPrice = cleanPrice.replace(',', '.');
      }
      
      numericPrice = parseFloat(cleanPrice);
      
      if (!isNaN(numericPrice) && numericPrice > 0) {
          m.validPriceCount++;
      } else {
          m.unparseableRowCount++;
      }

      // Duration parsing
      let durationValue = 0;
      let durationUnit = 'Day';
      const dMatch = durationText.match(/(\d+)/);
      if (dMatch) {
          durationValue = parseInt(dMatch[1], 10);
          if (durationValue > 0) m.validDurationCount++;
      }
      
      if (durationText.toLowerCase().includes('ay') || durationText.toLowerCase().includes('month')) {
          durationUnit = 'Month';
      } else if (durationText.toLowerCase().includes('hafta') || durationText.toLowerCase().includes('week')) {
          durationUnit = 'Week';
      }

      m.parsedTreatmentRowCount++;

      finalRows.push({
          sourceCategoryName: row.sourceCategoryName,
          sourceTreatmentName: name,
          normalizedTreatmentName: name.toLowerCase(),
          sourcePriceText: priceText,
          numericPrice,
          currency,
          sourceDurationText: durationText,
          durationValue,
          durationUnit,
          sourceUrl: row.sourceUrl,
          sourceCategoryIndex: row.sourceCategoryIndex,
          sourceRowIndex: row.sourceRowIndex
      });
  });

  return {
      metrics: m,
      rows: finalRows
  };
}
